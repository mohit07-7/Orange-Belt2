"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

// ── Initialize the Stellar Wallets Kit once (singleton pattern) ──────────
// This enables Freighter (desktop extension), Albedo (mobile web),
// WalletConnect (LOBSTR & native apps), and all other supported modules.
let kitInitialized = false;

function ensureKitInit() {
  if (kitInitialized || typeof window === "undefined") return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
  });
  kitInitialized = true;
}

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  balanceRefreshTrigger: number;
  setAddress: (address: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
  signAndSend: (tx: { toXDR(): string }) => Promise<unknown>;
  autoConnect: () => Promise<void>;
  triggerBalanceRefresh: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      address: null,
      isConnecting: false,
      error: null,
      balanceRefreshTrigger: 0,

      setAddress: (address) => set({ address, error: null }),

      // ── Connect: opens the kit's built-in multi-wallet modal ──────
      connect: async () => {
        ensureKitInit();
        set({ isConnecting: true, error: null });
        try {
          // authModal shows wallet picker → user selects → address returned
          const { address } = await StellarWalletsKit.authModal();
          set({ address, isConnecting: false });
          console.log("Connected via StellarWalletsKit:", address);
        } catch (err) {
          set({
            isConnecting: false,
            error: err instanceof Error ? err.message : "Connection failed",
          });
          console.error("Wallet connection failed", err);
        }
      },

      // ── Disconnect: clears kit state + local storage ──────────────
      disconnect: () => {
        StellarWalletsKit.disconnect();
        set({ address: null, error: null });
      },

      // ── Sign: delegates XDR signing to whichever wallet module is active ──
      signTx: async (xdr: string, networkPassphrase: string): Promise<string> => {
        ensureKitInit();
        try {
          const { address } = get();
          const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase,
            address: address ?? undefined,
          });
          return signedTxXdr;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/rejected|cancelled|canceled|denied|dismissed/i.test(msg)) {
            throw new Error("Wallet signing was cancelled.");
          }
          if (err instanceof Error && !/rejected|cancelled|canceled|denied|dismissed/i.test(msg)) {
            console.error("Transaction signing failed:", err);
          }
          throw err;
        }
      },

      // ── Sign & Send: signs then submits via the Stellar SDK ───────
      signAndSend: async (tx: { toXDR(): string }) => {
        ensureKitInit();
        try {
          const { address } = get();
          const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
            networkPassphrase: Networks.TESTNET,
            address: address ?? undefined,
          });

          const { rpc, TransactionBuilder } = await import("@stellar/stellar-sdk");
          const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
          const server = new rpc.Server("https://soroban-testnet.stellar.org");
          const sendResult = await server.sendTransaction(signedTx);
          return sendResult;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/rejected|cancelled|canceled|denied|dismissed/i.test(msg)) {
            throw new Error("Wallet signing was cancelled.");
          }
          if (err instanceof Error) {
            console.error("signAndSend failed:", err);
          }
          throw err;
        }
      },

      triggerBalanceRefresh: () =>
        set((s) => ({ balanceRefreshTrigger: s.balanceRefreshTrigger + 1 })),

      // ── Auto-connect: if kit already has a stored session, retrieve address ──
      autoConnect: async () => {
        if (typeof window === "undefined") return;
        ensureKitInit();
        try {
          const { address } = await StellarWalletsKit.getAddress();
          if (address) {
            set({ address, error: null });
            console.log("Auto-connected via kit:", address);
          } else {
            set({ address: null, error: null });
          }
        } catch {
          // Kit has no stored session — silently clear
          set({ address: null, error: null });
        }
      },
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ address: state.address }),
    }
  )
);
