"use client";

import { useWalletStore } from "@/store/walletStore";
import MintAssetForm from "@/components/MintAssetForm";

export default function MintPage() {
  const { address } = useWalletStore();

  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-10 text-center">
          <p className="font-mono text-xs text-[#44445a]">
            WALLET_NOT_CONNECTED
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
          // MINT NFT
        </h1>
        <p className="mt-1 text-xs text-[#9898b0]">
          Upload an asset image, pin it to IPFS, and mint a Soroban NFT in one
          transaction.
        </p>
      </div>

      <MintAssetForm />
    </main>
  );
}
