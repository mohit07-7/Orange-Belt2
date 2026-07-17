"use client";

import { create } from "zustand";

// ── Types ──────────────────────────────────────────────────────────────

export interface MintedNft {
  /** Soroban token ID returned by the mint transaction */
  tokenId: string;
  /** IPFS metadata URI (ipfs://...) */
  metadataUri: string;
  /** Gateway URL for the metadata JSON */
  metadataGateway: string;
  /** Gateway URL for the image itself */
  imageGateway: string;
  /** Human-readable title */
  title: string;
  /** Optional description */
  description: string;
  /** Transaction hash of the mint */
  txHash: string;
  /** Unix timestamp (ms) when the NFT was minted */
  mintedAt: number;
  /** Wallet address of the minter */
  owner: string;
}

interface NftState {
  /** All minted NFTs across all sessions */
  nfts: MintedNft[];
  /** Add a newly minted NFT to the registry */
  addNft: (nft: MintedNft) => void;
  /** Remove an NFT by token ID */
  removeNft: (tokenId: string) => void;
}

// ── localStorage helpers ───────────────────────────────────────────────

const STORAGE_KEY = "zenith_minted_nfts";

function loadNfts(): MintedNft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MintedNft[];
  } catch {
    return [];
  }
}

function saveNfts(nfts: MintedNft[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nfts));
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

// ── Store ──────────────────────────────────────────────────────────────

export const useNftStore = create<NftState>((set, get) => ({
  nfts: [],

  addNft: (nft) => {
    const updated = [nft, ...get().nfts];
    saveNfts(updated);
    set({ nfts: updated });
  },

  removeNft: (tokenId) => {
    const updated = get().nfts.filter((n) => n.tokenId !== tokenId);
    saveNfts(updated);
    set({ nfts: updated });
  },
}));

// Hydrate on module load (client-side only)
if (typeof window !== "undefined") {
  useNftStore.setState({ nfts: loadNfts() });
}
