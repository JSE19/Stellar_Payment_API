/**
 * Background Horizon Poller
 *
 * Periodically fetches all pending payments from the DB and checks Horizon
 * for matching transactions. When found, updates status to "confirmed" and
 * fires webhooks/SSE/email — exactly the same logic as the verify-payment route.
 *
 * This ensures payments confirm automatically even if the customer closes the
 * browser before the frontend calls /api/verify-payment/:id.
 */

import { supabase } from "./supabase.js";
import { findMatchingPayment } from "./stellar.js";
import { sendWebhook, isEventSubscribed } from "./webhooks.js";
import { sendReceiptEmail } from "./email.js";
import { renderReceiptEmail } from "./email-templates.js";
import { getPayloadForVersion } from "../webhooks/resolver.js";
import { streamManager } from "./stream-manager.js";
import { connectRedisClient, invalidatePaymentCache } from "./redis.js";
import { logger } from "./logger.js";
import {
  paymentConfirmedCounter,
  paymentConfirmationLatency,
} from "./metrics.js";

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const BATCH_SIZE = 50;           // max pending payments per cycle
const MAX_AGE_HOURS = 24;        // ignore payments older than 24h (likely abandoned)

let _io = null;
let _timer = null;
let _running = false;

export function startHorizonPoller(io) {
  _io = io;
  _timer = setInterval(pollPendingPayments, POLL_INTERVAL_MS);
  // Run immediately on startup too
  pollPendingPayments();
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Horizon poller started");
}

export function stopHorizonPoller() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  logger.info("Horizon poller stopped");
}

async function pollPendingPayments() {
  if (_running) return; // skip if previous cycle still running
  _running = true;

  try {
    const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: pending, error } = await supabase
      .from("payments")
      .select("id, amount, asset, asset_issuer, recipient, memo, memo_type, webhook_url, created_at, merchant_id, merchants(webhook_secret, webhook_version, notification_email, email, business_name, webhook_custom_headers)")
      .eq("status", "pending")
      .is("deleted_at", null)
      .gte("created_at", cutoff)
      .limit(BATCH_SIZE);

    if (error) {
      logger.warn({ err: error }, "Horizon poller: failed to fetch pending payments");
      return;
    }

    if (!pending || pending.length === 0) return;

    logger.info({ count: pending.length }, "Horizon poller: checking pending payments");

    await Promise.allSettled(pending.map(p => checkPayment(p)));

  } catch (err) {
    logger.warn({ err }, "Horizon poller: unexpected error");
  } finally {
    _running = false;
  }
}

async function checkPayment(payment) {
  try {
    // Guard: skip if essential fields are missing
    if (!payment.asset || !payment.recipient) {
      logger.warn({ paymentId: payment.id }, "Horizon poller: skipping payment with missing asset or recipient");
      return;
    }

    const match = await findMatchingPayment({
      recipient: payment.recipient,
      amount: payment.amount,
      assetCode: payment.asset,
      assetIssuer: payment.asset_issuer,
      memo: payment.memo,
      memoType: payment.memo_type,
      createdAt: payment.created_at,
    });

    if (!match) {
      logger.info({ paymentId: payment.id }, "Horizon poller: no match yet");
      return; // not confirmed yet
    }

    // Guard: ensure this tx_hash hasn't already confirmed a different payment
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("tx_id", match.transaction_hash)
      .neq("id", payment.id)
      .maybeSingle();

    if (existing) {
      logger.warn({ paymentId: payment.id, txHash: match.transaction_hash }, "Horizon poller: tx_hash already used by another payment — skipping");
      return;
    }

    const createdAt = new Date(payment.created_at);
    const latencySeconds = (Date.now() - createdAt.getTime()) / 1000;

    // Update DB
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "confirmed",
        tx_id: match.transaction_hash,
        completion_duration_seconds: Math.floor(latencySeconds),
      })
      .eq("id", payment.id)
      .eq("status", "pending"); // guard against double-confirm

    if (updateError) {
      logger.warn({ err: updateError, paymentId: payment.id }, "Horizon poller: DB update failed");
      return;
    }

    // Invalidate Redis cache
    const redis = await connectRedisClient();
    await invalidatePaymentCache(redis, payment.id);

    // Metrics
    paymentConfirmedCounter.inc({ asset: payment.asset });
    paymentConfirmationLatency.observe({ asset: payment.asset }, latencySeconds);

    logger.info({ paymentId: payment.id, txHash: match.transaction_hash }, "Horizon poller: payment confirmed");

    // SSE → customer checkout page
    streamManager.notify(payment.id, "payment.confirmed", {
      status: "confirmed",
      tx_id: match.transaction_hash,
    });

    // Socket.io → merchant dashboard
    if (_io && payment.merchant_id) {
      _io.to(`merchant:${payment.merchant_id}`).emit("payment:confirmed", {
        id: payment.id,
        amount: payment.amount,
        asset: payment.asset,
        asset_issuer: payment.asset_issuer,
        recipient: payment.recipient,
        tx_id: match.transaction_hash,
        confirmed_at: new Date().toISOString(),
      });
    }

    // Webhook
    const merchant = payment.merchants;
    if (merchant) {
      const webhookPayload = getPayloadForVersion(
        merchant.webhook_version || "v1",
        "payment.confirmed",
        { payment_id: payment.id, amount: payment.amount, asset: payment.asset, asset_issuer: payment.asset_issuer, recipient: payment.recipient, tx_id: match.transaction_hash }
      );

      if (payment.webhook_url && isEventSubscribed(merchant, "payment.confirmed")) {
        sendWebhook(payment.webhook_url, webhookPayload, merchant.webhook_secret, payment.id, merchant.webhook_custom_headers ?? {})
          .catch(err => logger.warn({ err, paymentId: payment.id }, "Horizon poller: webhook failed"));
      }

      // Receipt email
      const receiptTo = merchant.notification_email || merchant.email;
      if (receiptTo) {
        const html = renderReceiptEmail({ payment: { ...payment, tx_id: match.transaction_hash }, merchant });
        sendReceiptEmail({ to: receiptTo, subject: `Payment Receipt – ${payment.id}`, html })
          .catch(err => logger.warn({ err, paymentId: payment.id }, "Horizon poller: receipt email failed"));
      }
    }

  } catch (err) {
    // Non-fatal — log and continue with other payments
    logger.warn({ err, paymentId: payment.id }, "Horizon poller: error checking payment");
  }
}
