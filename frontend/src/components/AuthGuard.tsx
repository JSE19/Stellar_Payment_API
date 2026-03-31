"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMerchantHydrated, useMerchantSession } from "@/lib/merchant-store";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Component mounted
  }, []);

  // useEffect(() => {
  //   const isBypass = typeof window !== "undefined" && 
  //     (window.location.search.includes("bypass=true") || process.env.NEXT_PUBLIC_DEV_BYPASS === "true");

  //   if (mounted && hydrated && !session && !isBypass) {
  //     router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  //   }
  // }, [mounted, hydrated, session, router, pathname]);

  // if (!mounted || !hydrated) {
  //   return null;
  // }

  // const isBypass = typeof window !== "undefined" && 
  //   (window.location.search.includes("bypass=true") || process.env.NEXT_PUBLIC_DEV_BYPASS === "true");

  // if (!session && !isBypass) {
  //   return null;
  // }

  return <>{children}</>;
}
