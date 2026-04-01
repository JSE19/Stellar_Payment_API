"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWallet } from "@/lib/wallet-context";
import { connectWalletConnect } from "@/lib/wallet-walletconnect";
import { QRCodeSVG } from "qrcode.react";
import { Spinner } from "./ui/Spinner";

interface WalletSelectorProps {
  networkPassphrase: string;
  onConnected: () => void;
}

export default function WalletSelector({
  networkPassphrase,
  onConnected,
}: WalletSelectorProps) {
  const t = useTranslations("walletSelector");
  const { providers, activeProvider, selectProvider } = useWallet();

  const [providerAvailability, setProviderAvailability] = useState<
    Record<string, boolean>
  >({});
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [wcPairing, setWcPairing] = useState(false);
  const [wcError, setWcError] = useState<string | null>(null);

  // Check which providers are available on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      providers.map(async (p) => {
        const ok = await p.isAvailable();
        return [p.id, ok] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        setProviderAvailability(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [providers]);

  // If the active provider is already selected, nothing to show
  if (activeProvider) return null;

  async function handleSelect(id: string) {
    if (id === "walletconnect") {
      setWcError(null);
      setWcPairing(true);
      try {
        const { uri, approval } = await connectWalletConnect(networkPassphrase);
        setWcUri(uri);
        await approval;
        selectProvider("walletconnect");
        onConnected();
      } catch (err) {
        setWcError(err instanceof Error ? err.message : t("pairingFailed"));
      } finally {
        setWcPairing(false);
        setWcUri(null);
      }
      return;
    }

    selectProvider(id);
    onConnected();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-[#0A0A0A]">{t("chooseWallet")}</p>
        <p className="text-xs text-[#6B6B6B]">Connect your Stellar wallet to complete this payment.</p>
      </div>

      <div className="flex flex-col gap-3">
        {providers.map((p) => {
          const available = providerAvailability[p.id] ?? false;
          const isWc = p.id === "walletconnect";

          return (
            <button
              key={p.id}
              type="button"
              disabled={!available || wcPairing}
              onClick={() => handleSelect(p.id)}
              className="group relative flex h-14 w-full items-center gap-4 rounded-2xl border border-[#E8E8E8] bg-white px-5 text-left shadow-sm transition-all hover:border-[#0A0A0A] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {/* Wallet icon placeholder */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F5F5F5] border border-[#E8E8E8] group-hover:bg-[#0A0A0A] group-hover:border-[#0A0A0A] transition-all">
                <svg className="h-4 w-4 text-[#6B6B6B] group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>

              <div className="flex flex-1 flex-col">
                {isWc && wcPairing ? (
                  <span className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                    <Spinner size="sm" />
                    {t("walletConnectWaiting")}
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-bold text-[#0A0A0A]">{p.name}</span>
                    <span className="text-[10px] font-medium text-[#6B6B6B]">
                      {!available
                        ? (isWc ? t("noProjectId") : t("notInstalled"))
                        : "Click to connect"}
                    </span>
                  </>
                )}
              </div>

              {/* Arrow */}
              {available && !wcPairing && (
                <svg className="h-4 w-4 shrink-0 text-[#6B6B6B] group-hover:text-[#0A0A0A] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {wcUri && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] p-6">
          <p className="text-xs font-medium text-[#6B6B6B]">{t("scanTitle")}</p>
          <div className="rounded-lg bg-white border border-[#E8E8E8] p-3">
            <QRCodeSVG value={wcUri} size={200} level="M" />
          </div>
        </div>
      )}

      {wcError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600">
          {wcError}
        </p>
      )}
    </div>
  );
}
