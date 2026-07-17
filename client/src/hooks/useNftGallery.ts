"use client";

import { useCallback, useEffect, useState } from "react";
import { useWalletStore } from "@/store/walletStore";
import { NETWORK, NFT_CONTRACT_ADDRESS } from "@/lib/constants";
import {
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
  xdr,
} from "@stellar/stellar-sdk";

const { Server } = rpc;

type SorobanServer = InstanceType<typeof Server>;

// ── Types ──────────────────────────────────────────────────────────────

export interface OnChainNft {
  tokenId: string;
  owner: string;
  metadataUri: string;
  title: string;
  description: string;
  imageGateway: string;
  metadataGateway: string;
}

interface UseNftGalleryReturn {
  onChainNfts: OnChainNft[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function getServer() {
  if (!NETWORK.rpcUrl) return null;
  return new Server(NETWORK.rpcUrl, { allowHttp: true });
}

function getNftContract(): Contract | null {
  if (!NFT_CONTRACT_ADDRESS) return null;
  return new Contract(NFT_CONTRACT_ADDRESS);
}

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

/** Build a read-only simulation transaction against the NFT contract. */
async function simulateRead(
  server: SorobanServer,
  contract: Contract,
  method: string,
  params: xdr.ScVal[],
): Promise<xdr.ScVal | null> {
  const source = new Account(
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "0",
  );

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);

  if ("error" in sim || !sim.result?.retval) return null;
  return sim.result.retval;
}

/** Fetch metadata JSON from IPFS and extract title, description, image. */
async function resolveMetadata(
  metadataUri: string,
): Promise<{ title: string; description: string; imageGateway: string; metadataGateway: string }> {
  // Convert ipfs:// URI to gateway URL
  const cid = metadataUri.replace("ipfs://", "");
  const gatewayUrl = `${PINATA_GATEWAY}/${cid}`;

  try {
    const res = await fetch(gatewayUrl);
    if (!res.ok) throw new Error("Metadata fetch failed");
    const json = await res.json();

    const imageUri = json.image || "";
    const imageCid = imageUri.replace("ipfs://", "");
    const imageGateway = imageCid ? `${PINATA_GATEWAY}/${imageCid}` : "";

    return {
      title: json.name || "Untitled NFT",
      description: json.description || "",
      imageGateway,
      metadataGateway: gatewayUrl,
    };
  } catch {
    return {
      title: "Untitled NFT",
      description: "",
      imageGateway: "",
      metadataGateway: gatewayUrl,
    };
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useNftGallery(): UseNftGalleryReturn {
  const { address } = useWalletStore();
  const [onChainNfts, setOnChainNfts] = useState<OnChainNft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOnChainNfts = useCallback(async () => {
    const caller = address;
    if (!caller) {
      setOnChainNfts([]);
      return;
    }

    const server = getServer();
    const contract = getNftContract();
    if (!server || !contract) {
      setError("NFT contract or RPC not configured");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Scan token IDs 1..50 — on testnet this is a reasonable ceiling.
      // Stop scanning early on consecutive misses.
      const MAX_SCAN = 50;
      const MAX_CONSECUTIVE_MISSES = 5;
      const found: OnChainNft[] = [];
      let consecutiveMisses = 0;

      for (let id = 1; id <= MAX_SCAN; id++) {
        const tokenId = BigInt(id);

        // Query owner_of
        const ownerVal = await simulateRead(server, contract, "owner_of", [
          nativeToScVal(tokenId, { type: "i128" }),
        ]);

        if (!ownerVal) {
          consecutiveMisses++;
          if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) break;
          continue;
        }

        const ownerAddr = scValToNative(ownerVal);

        // Normalize and compare addresses
        const normalizedOwner = String(ownerAddr).trim().toUpperCase();
        const normalizedCaller = caller.trim().toUpperCase();

        if (normalizedOwner !== normalizedCaller) {
          consecutiveMisses = 0;
          continue;
        }

        consecutiveMisses = 0;

        // Query token_uri
        const uriVal = await simulateRead(server, contract, "token_uri", [
          nativeToScVal(tokenId, { type: "i128" }),
        ]);

        const metadataUri = uriVal ? String(scValToNative(uriVal)) : "";

        // Resolve IPFS metadata
        const meta = await resolveMetadata(metadataUri);

        found.push({
          tokenId: String(tokenId),
          owner: String(ownerAddr),
          metadataUri,
          ...meta,
        });
      }

      setOnChainNfts(found);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to scan NFTs";
      console.error("NFT gallery scan error:", msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Auto-fetch on wallet connect
  useEffect(() => {
    fetchOnChainNfts();
  }, [fetchOnChainNfts]);

  return {
    onChainNfts,
    isLoading,
    error,
    refresh: fetchOnChainNfts,
  };
}
