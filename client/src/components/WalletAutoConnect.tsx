"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";

export default function WalletAutoConnect() {
  const autoConnect = useWalletStore((state) => state.autoConnect);

  // Auto-connect wallet on mount (only runs once client-side)
  useEffect(() => {
    autoConnect();
  }, [autoConnect]);

  return null;
}