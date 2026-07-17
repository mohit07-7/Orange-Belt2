import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ── Pinata configuration ───────────────────────────────────────────────
const PINATA_API = "https://api.pinata.cloud";
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

// ── Types ──────────────────────────────────────────────────────────────
interface PinataPinResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface NftMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Pin raw binary data to IPFS via Pinata's pinFileToIPFS endpoint. */
async function pinFileToIPFS(
  buffer: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<PinataPinResponse> {
  const blob = new Blob([buffer], { type: contentType });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinata file upload failed (${res.status}): ${err}`);
  }

  return res.json();
}

/** Pin a JSON metadata blob to IPFS via Pinata's pinJSONToIPFS endpoint. */
async function pinJSONToIPFS(
  metadata: NftMetadata,
): Promise<PinataPinResponse> {
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `nft-metadata-${Date.now()}.json`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinata JSON pin failed (${res.status}): ${err}`);
  }

  return res.json();
}

// ── Route Handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json(
      { error: "Server misconfigured: PINATA_JWT not set" },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Untitled NFT";
    const description = (formData.get("description") as string) || "";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate file type (images only)
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are accepted" },
        { status: 400 },
      );
    }

    // Validate file size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 400 },
      );
    }

    // ── Step 1: Upload the image to IPFS ──────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const imageResult = await pinFileToIPFS(
      arrayBuffer,
      file.name,
      file.type,
    );

    const imageIpfsUri = `ipfs://${imageResult.IpfsHash}`;
    const imageGatewayUrl = `${PINATA_GATEWAY}/${imageResult.IpfsHash}`;

    // ── Step 2: Build ERC-721 compatible metadata ─────────────────
    const metadata: NftMetadata = {
      name: title,
      description,
      image: imageIpfsUri,
      attributes: [
        { trait_type: "File Type", value: file.type },
        {
          trait_type: "File Size",
          value: `${(file.size / 1024).toFixed(1)} KB`,
        },
        { trait_type: "Platform", value: "ZENITH Auction Protocol" },
      ],
      created_at: new Date().toISOString(),
    };

    // ── Step 3: Pin the metadata JSON ─────────────────────────────
    const metadataResult = await pinJSONToIPFS(metadata);
    const metadataUri = `ipfs://${metadataResult.IpfsHash}`;

    return NextResponse.json({
      success: true,
      imageUri: imageIpfsUri,
      imageGateway: imageGatewayUrl,
      metadataUri,
      metadataGateway: `${PINATA_GATEWAY}/${metadataResult.IpfsHash}`,
      pinata: {
        image: {
          hash: imageResult.IpfsHash,
          size: imageResult.PinSize,
        },
        metadata: {
          hash: metadataResult.IpfsHash,
          size: metadataResult.PinSize,
        },
      },
    });
  } catch (err: unknown) {
    console.error("IPFS upload error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
