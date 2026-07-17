"use client";

import { NETWORK } from "@/lib/constants";
import {
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Account,
  xdr,
} from "@stellar/stellar-sdk";

const { Server } = rpc;

type SorobanServer = InstanceType<typeof Server>;

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export interface NftMetadata {
  name: string;
  description: string;
  imageGateway: string;
  metadataGateway: string;
}

function getServer(): SorobanServer | null {
  if (!NETWORK.rpcUrl) return null;
  return new Server(NETWORK.rpcUrl, { allowHttp: true });
}

/** Build a read-only simulation transaction against a Soroban contract. */
async function simulateRead(
  server: SorobanServer,
  contractAddress: string,
  method: string,
  params: xdr.ScVal[],
): Promise<string | null> {
  const contract = new Contract(contractAddress);
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
  return String(scValToNative(sim.result.retval));
}

/** Convert an ipfs:// URI to a public gateway URL. */
function ipfsToGateway(uri: string): string {
  const cid = uri.replace("ipfs://", "").replace("/ipfs/", "");
  return `${PINATA_GATEWAY}/${cid}`;
}

/** Fetch ERC-721 metadata JSON from IPFS and extract name + image. */
async function resolveMetadataJson(
  metadataUri: string,
): Promise<Pick<NftMetadata, "name" | "description" | "imageGateway" | "metadataGateway">> {
  if (!metadataUri) {
    return { name: "Unknown NFT", description: "", imageGateway: "", metadataGateway: "" };
  }

  const gatewayUrl = ipfsToGateway(metadataUri);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(gatewayUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    const imageUri = String(json.image ?? "");
    const imageGateway = imageUri ? ipfsToGateway(imageUri) : "";

    return {
      name: String(json.name ?? "Untitled NFT"),
      description: String(json.description ?? ""),
      imageGateway,
      metadataGateway: gatewayUrl,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    console.error("IPFS metadata resolve failed:", msg);
    return {
      name: "Untitled NFT",
      description: "",
      imageGateway: "",
      metadataGateway: gatewayUrl,
    };
  }
}

/**
 * Fetch NFT metadata for a given contract + token_id.
 *
 * 1. Calls `token_uri(token_id: i128)` on the NFT contract via read-only simulation.
 * 2. Converts the returned ipfs:// URI to a gateway URL.
 * 3. Fetches the JSON and extracts name + image.
 */
export async function fetchNftMetadata(
  nftContractAddress: string,
  tokenId: bigint,
): Promise<NftMetadata> {
  const server = getServer();
  if (!server) {
    return { name: "Unknown NFT", description: "", imageGateway: "", metadataGateway: "" };
  }

  try {
    // Step 1: Read-only call to token_uri on the NFT contract
    const metadataUri = await simulateRead(
      server,
      nftContractAddress,
      "token_uri",
      [nativeToScVal(tokenId, { type: "i128" }) as xdr.ScVal],
    );

    if (!metadataUri) {
      return { name: "Unknown NFT", description: "", imageGateway: "", metadataGateway: "" };
    }

    // Step 2: Resolve the IPFS JSON metadata
    const meta = await resolveMetadataJson(metadataUri);
    return meta;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("fetchNftMetadata failed:", msg);
    return { name: "Unknown NFT", description: "", imageGateway: "", metadataGateway: "" };
  }
}
