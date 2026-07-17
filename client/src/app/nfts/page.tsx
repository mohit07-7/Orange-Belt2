"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useWalletStore } from "@/store/walletStore";
import { useNftStore, type MintedNft } from "@/store/nftStore";
import { useNftGallery, type OnChainNft } from "@/hooks/useNftGallery";
import { useNftMint } from "@/hooks/useNftMint";

function truncate(str: string, chars = 6): string {
  if (str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "JUST NOW";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h AGO`;
  const d = Math.floor(h / 24);
  return `${d}d AGO`;
}

function NftCard({ nft, onDelete, onBurn, onAdminBurn, isContractLocked }: { nft: MintedNft; onDelete?: () => void; onBurn?: () => void; onAdminBurn?: () => void; isContractLocked?: boolean }) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [burnConfirming, setBurnConfirming] = useState(false);

  return (
    <div className="group relative flex flex-col border-2 border-[#1e1e2e] bg-[#0a0a0f] shadow-[4px_4px_0px_0px_#050508] transition hover:-translate-x-1 hover:-translate-y-1 hover:border-[#3b82f6] hover:shadow-[6px_6px_0px_0px_#1e40af]">
      {/* Image */}
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden border-b-2 border-[#1e1e2e] bg-[#0e0e16]">
        {!imgError && nft.imageGateway ? (
          <img
            src={nft.imageGateway}
            alt={nft.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <span className="text-3xl text-[#9898b0]">#</span>
            <span className="font-mono text-[10px] text-[#9898b0]">
              IMAGE_UNAVAILABLE
            </span>
          </div>
        )}

        {/* Token badge */}
        <div className="absolute left-3 top-3 border-2 border-[#3b82f6] bg-[#0a0a0f]/90 px-2 py-0.5 text-[10px] font-bold text-[#3b82f6]">
          #{nft.tokenId}
        </div>

        {/* Delete button (only for local NFTs) */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (confirming) {
                onDelete();
              } else {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 3000);
              }
            }}
            className={`absolute right-3 top-3 border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${
              confirming
                ? "border-[#ef4444] bg-[#ef4444]/20 text-[#ef4444]"
                : "border-[#1e1e2e] bg-[#0a0a0f]/90 text-[#6b6b80] opacity-0 group-hover:opacity-100 hover:border-[#ef4444] hover:text-[#ef4444]"
            }`}
          >
            {confirming ? "CONFIRM?" : "✕"}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8e8f0]">
            {nft.title || "UNTITLED NFT"}
          </h3>
          {nft.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#9898b0]">
              {nft.description}
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              MINTED
            </span>
            <span className="font-mono text-xs text-[#9898b0]">
              {timeAgo(nft.mintedAt)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              TOKEN
            </span>
            <span className="font-mono text-xs text-[#9898b0]">
              {truncate(nft.tokenId)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Extract image CID from gateway URL for preview
              const imageHash = nft.imageGateway
                ? nft.imageGateway.replace(`${"https://gateway.pinata.cloud/ipfs/"}`, "")
                : nft.metadataUri.replace("ipfs://", "");
              const params = new URLSearchParams({
                tokenId: nft.tokenId,
                hash: imageHash,
              });
              router.push(`/create?${params.toString()}`);
            }}
            className="flex items-center justify-center border-2 border-[#22c55e] bg-[#22c55e]/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#22c55e] transition hover:bg-[#22c55e]/20"
          >
            LIST FOR AUCTION &rarr;
          </button>
          <a
            href={nft.metadataGateway}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#44445a] transition hover:border-[#3b82f6] hover:text-[#3b82f6]"
          >
            VIEW ON IPFS &rarr;
          </a>
          {onAdminBurn && isContractLocked && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (burnConfirming) {
                  onAdminBurn();
                } else {
                  setBurnConfirming(true);
                  setTimeout(() => setBurnConfirming(false), 3000);
                }
              }}
              className={`flex items-center justify-center border-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                burnConfirming
                  ? "border-[#ef4444] bg-[#ef4444]/20 text-[#ef4444]"
                  : "border-[#eab308] bg-[#0e0e16] text-[#eab308] hover:border-[#ef4444] hover:text-[#ef4444]"
              }`}
            >
              {burnConfirming ? "CONFIRM ADMIN BURN?" : "FORCE ADMIN BURN"}
            </button>
          )}
          {onBurn && !isContractLocked && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (burnConfirming) {
                  onBurn();
                } else {
                  setBurnConfirming(true);
                  setTimeout(() => setBurnConfirming(false), 3000);
                }
              }}
              className={`flex items-center justify-center border-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                burnConfirming
                  ? "border-[#ef4444] bg-[#ef4444]/20 text-[#ef4444]"
                  : "border-[#1e1e2e] bg-[#0e0e16] text-[#6b6b80] hover:border-[#ef4444] hover:text-[#ef4444]"
              }`}
            >
              {burnConfirming ? "CONFIRM BURN?" : "BURN NFT"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type DisplayNft = MintedNft & { source: "local" | "onchain" };

function mergeNfts(local: MintedNft[], onChain: OnChainNft[]): DisplayNft[] {
  const merged = new Map<string, DisplayNft>();

  // Local NFTs (have richer metadata from mint session)
  for (const n of local) {
    merged.set(n.tokenId, { ...n, source: "local" });
  }

  // On-chain NFTs — fill in gaps or add new entries
  for (const n of onChain) {
    const existing = merged.get(n.tokenId);
    if (existing) {
      // Prefer local metadata if it has more info, but fill in missing fields
      merged.set(n.tokenId, {
        ...existing,
        title: existing.title || n.title,
        description: existing.description || n.description,
        imageGateway: existing.imageGateway || n.imageGateway,
        metadataGateway: existing.metadataGateway || n.metadataGateway,
        metadataUri: existing.metadataUri || n.metadataUri,
      });
    } else {
      merged.set(n.tokenId, {
        tokenId: n.tokenId,
        metadataUri: n.metadataUri,
        metadataGateway: n.metadataGateway,
        imageGateway: n.imageGateway,
        title: n.title,
        description: n.description,
        txHash: "",
        mintedAt: 0,
        owner: n.owner,
        source: "onchain",
      });
    }
  }

  // Sort by token ID descending (newest first)
  return Array.from(merged.values()).sort(
    (a, b) => Number(BigInt(b.tokenId) - BigInt(a.tokenId)),
  );
}

export default function NftsPage() {
  const { address } = useWalletStore();
  const { nfts } = useNftStore();
  const { onChainNfts, isLoading: onChainLoading, error: onChainError, refresh } = useNftGallery();
  const { burnNft, adminBurnNft } = useNftMint();

  // Standard burn — user owns the NFT directly
  const handleBurn = useCallback(async (tokenId: string) => {
    try {
      await burnNft(tokenId);
      refresh();
    } catch (err) {
      console.error("Burn failed:", err);
    }
  }, [burnNft, refresh]);

  // Admin burn — NFT is locked in a contract (owner address starts with "C")
  const handleAdminBurn = useCallback(async (tokenId: string) => {
    try {
      await adminBurnNft(tokenId);
      refresh();
    } catch (err) {
      console.error("Admin burn failed:", err);
    }
  }, [adminBurnNft, refresh]);

  const myLocalNfts = address
    ? nfts.filter((n) => n.owner === address)
    : [];

  const displayNfts = mergeNfts(myLocalNfts, onChainNfts);

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Header */}
      <section className="p-6 border-2 border-[#1e1e2e] bg-[#0e0e16]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
              // MY NFTS
            </h1>
            <p className="mt-1 text-xs text-[#9898b0]">
              {displayNfts.length} NFT{displayNfts.length !== 1 ? "s" : ""} found
              on this wallet
            </p>
          </div>
          <Link
            href="/mint"
            className="inline-flex items-center justify-center border-2 border-[#3b82f6] bg-[#3b82f6] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_0px_#1e40af] transition hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#1e40af]"
          >
            + MINT NEW
          </Link>
        </div>
      </section>

      {/* Loading */}
      {onChainLoading && displayNfts.length === 0 && (
        <section className="flex items-center justify-center gap-3 p-12">
          <span className="inline-block h-4 w-4 animate-spin border-2 border-[#44445a] border-t-[#3b82f6]" />
          <span className="text-xs font-bold uppercase text-[#9898b0]">
            Scanning on-chain NFTs...
          </span>
        </section>
      )}

      {/* Error */}
      {onChainError && (
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/5 p-4">
          <p className="text-xs font-bold uppercase text-[#ef4444]">
            [WARN] {onChainError}
          </p>
        </div>
      )}

      {/* NFT Grid */}
      {displayNfts.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8c8d8]">
              // ALL NFTS
            </h2>
            <button
              onClick={refresh}
              disabled={onChainLoading}
              className="border-2 border-[#1e1e2e] bg-[#0e0e16] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9898b0] transition hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50"
            >
              {onChainLoading ? "SCANNING..." : "REFRESH"}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayNfts.map((nft) => (
              <NftCard
                key={nft.tokenId}
                nft={nft}
                onDelete={
                  nft.source === "local"
                    ? () => useNftStore.getState().removeNft(nft.tokenId)
                    : undefined
                }
                onBurn={() => handleBurn(nft.tokenId)}
                onAdminBurn={() => handleAdminBurn(nft.tokenId)}
                isContractLocked={nft.owner.startsWith("C")}
              />
            ))}
          </div>
        </section>
      ) : !onChainLoading ? (
        <section className="flex flex-col items-center gap-4 border-2 border-dashed border-[#1e1e2e] bg-[#0e0e16] p-16 text-center">
          <p className="font-mono text-xs text-[#9898b0]">
            NO_NFTS_FOUND
          </p>
          <p className="text-sm font-bold text-[#9898b0]">
            You haven&apos;t minted any NFTs yet.
          </p>
          <Link
            href="/mint"
            className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_0px_#1e40af] transition hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#1e40af]"
          >
            + MINT YOUR FIRST NFT
          </Link>
        </section>
      ) : null}
    </main>
  );
}
