"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import { NFT_CONTRACT_ADDRESS } from "@/lib/constants";

const SUPPORTED_BID_TOKENS = [
  {
    symbol: "XLM",
    name: "Native Stellar Lumens",
    address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
  },
  {
    symbol: "USDC",
    name: "USD Coin (Testnet Dummy)",
    address: "CCW67TSZV3FE2V2W4E4B6GBYYV5Y2Z6P43JFVJ2ZXVX4P4O73L5JQQG2" 
  },
  {
    symbol: "CUSTOM",
    name: "Custom Contract ID",
    address: "custom"
  }
];

// ── Helper: Translates ugly blockchain logs into human UI ──
const parseErrorMessage = (rawError: string): string => {
  const err = rawError.toUpperCase();
  
  if (err.includes("CANCELLED")) 
    return "TRANSACTION CANCELLED BY USER.";
  if (err.includes("NOT A CONTRACT ADDRESS")) 
    return "INVALID ASSET: YOU PROVIDED A USER WALLET (G...) INSTEAD OF A TOKEN CONTRACT (C...).";
  if (err.includes("INSUFFICIENT BALANCE") || err.includes("BALANCE_TOO_LOW")) 
    return "INSUFFICIENT BALANCE: YOU DON'T OWN ENOUGH OF THIS TOKEN TO AUCTION IT.";
  if (err.includes("INVALIDINPUT")) 
    return "CONTRACT REJECTED INPUT: DOUBLE CHECK YOUR DATES AND TOKEN ADDRESSES.";
  if (err.includes("TIMEOUT") || err.includes("NETWORK")) 
    return "NETWORK TIMEOUT: THE STELLAR NETWORK TOOK TOO LONG TO RESPOND.";
  if (err.includes("TRY_AGAIN_LATER"))
    return "NETWORK BUSY: THE STELLAR RPC IS RATE-LIMITING. TRY AGAIN IN A FEW SECONDS.";  if (err.includes("TRANSFER_FROM")) 
    return "NFT TRANSFER FAILED: THE CONTRACT COULD NOT MOVE YOUR TOKEN. MAKE SURE YOU OWN THIS NFT AND HAVE APPROVED THE AUCTION.";
  if (err.includes("APPROVE FAILED") || err.includes("APPROVE SIMULATION"))
    return "NFT APPROVAL FAILED: COULD NOT APPROVE THE AUCTION CONTRACT TO TRANSFER YOUR NFT. MAKE SURE YOU OWN THIS TOKEN.";
  if (err.includes("NOT AUTHORIZED") && err.includes("DON'T OWN"))
    return "YOU DO NOT OWN THIS NFT. ONLY THE TOKEN OWNER CAN CREATE AN AUCTION FOR IT.";
  if (err.includes("NFT NOT FOUND") || err.includes("TOKEN NOT FOUND"))
    return "NFT NOT FOUND: THIS TOKEN ID DOES NOT EXIST IN THE NFT CONTRACT. DOUBLE-CHECK THE TOKEN ID.";
    
  // Fallback for unknown errors
  return "TRANSACTION FAILED: CHECK CONSOLE FOR DETAILS.";
};

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

function CreateAuctionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useWalletStore();
  const { auctions, setError: clearGlobalError } = useAuctionStore();
  const { createAuction, fetchAllAuctions } = useAuction();

  // Read NFT params from URL
  const urlTokenId = searchParams.get("tokenId");
  const urlHash = searchParams.get("hash") ?? "";
  const nftPreview = urlTokenId && urlHash ? {
    tokenId: urlTokenId,
    imageUrl: `${PINATA_GATEWAY}/${urlHash}`,
  } : null;

  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenIdInput, setTokenIdInput] = useState(urlTokenId ?? "");
  const [selectedBidToken, setSelectedBidToken] = useState(SUPPORTED_BID_TOKENS[0].address);
  const [customBidToken, setCustomBidToken] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [minBidIncrement, setMinBidIncrement] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "parsing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "warning">("error");
  const [imgError, setImgError] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowlistInput, setAllowlistInput] = useState("");

  // Auto-fill token address + tokenId with NFT contract if coming from gallery (once)
  useEffect(() => {
    if (urlTokenId) {
      setTokenAddress(NFT_CONTRACT_ADDRESS);
      setTokenIdInput(urlTokenId);
    }
  }, [urlTokenId]);

  useEffect(() => {
    if (address) { fetchAllAuctions(); }
  }, [address, fetchAllAuctions]);

  const myHostedAuctions = auctions.filter((a) => a.creator === address);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const cleanTokenAddress = tokenAddress.trim();
      const cleanStartPrice = startPrice.trim();
      const finalBidTokenAddress = selectedBidToken === "custom" 
        ? customBidToken.trim() 
        : selectedBidToken;

      if (!address) {
        setStatus("error");
        setMessage("CONNECT WALLET FIRST");
        return;
      }

      const cleanMinBidIncrement = minBidIncrement.trim();

      if (!cleanTokenAddress || !finalBidTokenAddress || !cleanStartPrice || !cleanMinBidIncrement || !startTime || !endTime) {
        setStatus("error");
        setMessage("ALL FIELDS REQUIRED");
        return;
      }

      // Pre-flight: validate tokenId
      const cleanTokenId = tokenIdInput.trim();
      if (!cleanTokenId) {
        setStatus("error");
        setMessage("TOKEN ID IS REQUIRED. ENTER THE NFT TOKEN ID TO AUCTION.");
        return;
      }
      const tokenIdParsed = Number(cleanTokenId);
      if (!Number.isFinite(tokenIdParsed) || !Number.isInteger(tokenIdParsed) || tokenIdParsed < 0) {
        setStatus("error");
        setMessage("INVALID TOKEN ID: MUST BE A VALID NON-NEGATIVE INTEGER.");
        return;
      }

      // Pre-flight check for "G" addresses
      if (cleanTokenAddress.startsWith("G") || finalBidTokenAddress.startsWith("G")) {
        setStatus("error");
        setMessage("INVALID ASSET: TOKENS MUST BE CONTRACTS STARTING WITH 'C', NOT WALLETS STARTING WITH 'G'.");
        return;
      }

      // Pre-flight: validate allowlist if private auction
      let allowlistAddresses: string[] = [];
      if (isPrivate) {
        const raw = allowlistInput.trim();
        if (!raw) {
          setStatus("error");
          setMessage("PRIVATE AUCTION REQUIRES AT LEAST ONE ALLOWLIST ADDRESS.");
          return;
        }
        allowlistAddresses = raw
          .split(",")
          .map((addr) => addr.trim())
          .filter((addr) => addr.length > 0);

        if (allowlistAddresses.length === 0) {
          setStatus("error");
          setMessage("ALLOWLIST CONTAINS NO VALID ADDRESSES.");
          return;
        }

        const invalidAddr = allowlistAddresses.find((addr) => !addr.startsWith("G"));
        if (invalidAddr) {
          setStatus("error");
          setMessage(`INVALID ALLOWLIST ADDRESS: "${invalidAddr}" — STELLAR WALLETS MUST START WITH 'G'.`);
          return;
        }
      }

      const startTs = Math.floor(new Date(startTime).getTime() / 1000);
      const endTs = Math.floor(new Date(endTime).getTime() / 1000);
      const priceDecimals = 7;
      const priceBigInt = BigInt(Math.round(Number(cleanStartPrice) * 10 ** priceDecimals));

      if (endTs <= startTs) {
        setStatus("error");
        setMessage("END TIME MUST BE AFTER START TIME");
        return;
      }

      if (priceBigInt <= 0n) {
        setStatus("error");
        setMessage("STARTING PRICE MUST BE > 0");
        return;
      }

      const minIncrementBigInt = BigInt(Math.round(Number(cleanMinBidIncrement) * 10 ** priceDecimals));
      if (minIncrementBigInt <= 0n) {
        setStatus("error");
        setMessage("MIN BID INCREMENT MUST BE > 0");
        return;
      }

      setStatus("submitting");
      setMessage("");
      setMessageType("error");

      try {
        // ── FIX: RESILIENT RETRY WRAPPER ──
        let retryCount = 0;
        const maxRetries = 3;
        let isSuccess = false;
        let createResult: { txHash: string; auctionId: number } | null = null;

        while (retryCount < maxRetries && !isSuccess) {
          try {
            createResult = await createAuction(
              address,
              cleanTokenAddress,
              BigInt(tokenIdParsed),
              finalBidTokenAddress, 
              priceBigInt,
              minIncrementBigInt,
              startTs,
              endTs,
              isPrivate,
              allowlistAddresses,
            );
            isSuccess = true;
          } catch (err: any) {
            // Check if it's specifically a rate-limit error, and if we have retries left
            if (err.message && err.message.includes("TRY_AGAIN_LATER") && retryCount < maxRetries - 1) {
              retryCount++;
              console.warn(`RPC is busy. Retrying transaction... (${retryCount}/${maxRetries})`);
              setMessage(`NETWORK BUSY. RETRYING... (${retryCount}/${maxRetries})`);
              await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
            } else {
              throw err; // If it's a real error (like insufficient funds) or we are out of retries, throw it
            }
          }
        }

        // The auction ID is parsed directly from the create_auction
        // contract return value — no stale-read needed.
        setStatus("parsing");
        setMessage("AUCTION CONFIRMED. PARSING AUCTION ID...");

        if (!createResult || createResult.auctionId < 1) {
          throw new Error("Failed to capture auction ID from transaction.");
        }
        const auctionId = createResult.auctionId;

        setStatus("success");
        setMessage(`AUCTION #${auctionId} CREATED. REDIRECTING...`);

        setTimeout(() => {
          router.push(`/auction/${auctionId}`);
        }, 2000);
      } catch (err: unknown) {
        clearGlobalError(null);
        
        const rawMsg = err instanceof Error ? err.message : "UNKNOWN ERROR";
        const isRejection = /cancel|reject|denied|dismissed/i.test(rawMsg);
        setMessageType(isRejection ? "warning" : "error");
        setStatus(isRejection ? "idle" : "error");
        setMessage(isRejection ? "TRANSACTION REJECTED — NO CHANGES WERE MADE" : parseErrorMessage(rawMsg));
        console.error("RAW TX ERROR:", rawMsg);
      }
    },
    [address, tokenAddress, tokenIdInput, selectedBidToken, customBidToken, startPrice, minBidIncrement, startTime, endTime, isPrivate, allowlistInput, createAuction, fetchAllAuctions, router, nftPreview, urlTokenId]
  );

  const inputClass = "w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3.5 font-mono text-sm text-[#e8e8f0] outline-none transition placeholder:text-[#44445a] disabled:opacity-50 focus:border-[#3b82f6]";

  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="brutal-static border-2 border-[#1e1e2e] bg-[#0e0e16] p-10 text-center">
          <p className="font-mono text-xs text-[#9898b0]">WALLET_NOT_CONNECTED</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-3">
      <div className="flex flex-col gap-8 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
            // NEW AUCTION
          </h1>
          <p className="mt-1 text-xs text-[#9898b0]">
            List a Soroban token. You must hold at least 1 unit of the auctioned token.
          </p>
        </div>

        {/* ── NFT Preview Card (when coming from gallery) ── */}
        {nftPreview && (
          <div className="flex items-center gap-3 border-2 border-[#22c55e] bg-[#22c55e]/5 p-3">
            {!imgError ? (
              <img
                src={nftPreview.imageUrl}
                alt="NFT preview"
                className="h-16 w-16 flex-shrink-0 rounded-sm border-2 border-[#1e1e2e] object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center border-2 border-[#1e1e2e] bg-[#0e0e16]">
                <span className="text-xl">#</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#22c55e]">
                NFT SELECTED FROM GALLERY
              </span>
              <span className="font-mono text-xs text-[#c8c8d8]">
                TOKEN #{nftPreview.tokenId}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              TOKEN_ADDRESS (Asset to sell) *
            </label>
            {nftPreview ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={NFT_CONTRACT_ADDRESS}
                  readOnly
                  className={`${inputClass} cursor-not-allowed opacity-70`}
                />
                <span className="flex-shrink-0 border-2 border-[#22c55e] bg-[#22c55e]/10 px-2 py-3 text-[10px] font-bold uppercase text-[#22c55e]">
                  LOCKED
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="C..."
                className={inputClass}
              />
            )}
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              TOKEN_ID (NFT token ID) *
            </label>
            {nftPreview ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tokenIdInput}
                  readOnly
                  className={`${inputClass} cursor-not-allowed opacity-70`}
                />
                <span className="flex-shrink-0 border-2 border-[#22c55e] bg-[#22c55e]/10 px-2 py-3 text-[10px] font-bold uppercase text-[#22c55e]">
                  LOCKED
                </span>
              </div>
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={tokenIdInput}
                onChange={(e) => setTokenIdInput(e.target.value)}
                placeholder="e.g. 42"
                className={inputClass}
              />
            )}
            <p className="mt-1 text-[10px] text-[#9898b0]">
              THE TOKEN ID OF THE NFT TO AUCTION
            </p>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              BID_TOKEN (Accept bids in) *
            </label>
            <select
              value={selectedBidToken}
              onChange={(e) => {
                setSelectedBidToken(e.target.value);
                if (e.target.value !== "custom") setCustomBidToken(""); 
              }}
              className={`${inputClass} cursor-pointer appearance-none`}
            >
              {SUPPORTED_BID_TOKENS.map((token) => (
                <option key={token.symbol} value={token.address}>
                  {token.symbol} — {token.name}
                </option>
              ))}
            </select>

            {selectedBidToken === "custom" && (
              <div className="mt-3">
                <input
                  type="text"
                  value={customBidToken}
                  onChange={(e) => setCustomBidToken(e.target.value)}
                  placeholder="Paste custom C... address"
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              START_PRICE *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={startPrice}
              onChange={(e) => setStartPrice(e.target.value)}
              placeholder="1.00"
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-[#9898b0]">
              ENTER AMOUNT IN STANDARD UNITS (E.G. 1.00 = 1 XLM)
            </p>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
              MIN_BID_INCREMENT * (minimum increase per bid)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={minBidIncrement}
              onChange={(e) => setMinBidIncrement(e.target.value)}
              placeholder="0.01"
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-[#9898b0]">
              EACH NEW BID MUST EXCEED THE PREVIOUS BY AT LEAST THIS AMOUNT
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                START_TIME *
              </label>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                END_TIME *
              </label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="border-t-2 border-[#1e1e2e] pt-6">
          {/* ── Private Auction Toggle ── */}
          <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                  PRIVATE AUCTION
                </label>
                <p className="mt-1 text-[10px] text-[#9898b0]">
                  RESTRICT BIDDING TO SPECIFIC WALLETS
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate(!isPrivate)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#0a0a0f] ${
                  isPrivate
                    ? "border-[#a855f7] bg-[#a855f7]"
                    : "border-[#1e1e2e] bg-[#1e1e2e]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform bg-[#e8e8f0] shadow-sm transition duration-200 ${
                    isPrivate ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* ── Allowlist Textarea (conditionally rendered) ── */}
            {isPrivate && (
              <div className="mt-4 border-t border-[#1e1e2e] pt-4">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#a855f7]">
                  ALLOWLIST (COMMA-SEPARATED)
                </label>
                <textarea
                  value={allowlistInput}
                  onChange={(e) => setAllowlistInput(e.target.value)}
                  placeholder="GABC..., GDEF..., GHIJ..."
                  rows={3}
                  className={`${inputClass} resize-none font-mono text-[10px] leading-relaxed placeholder:text-[#44445a] focus:border-[#a855f7]`}
                />
                <p className="mt-1 text-[10px] text-[#9898b0]">
                  ONLY THESE WALLETS MAY BID ON THIS AUCTION
                </p>
              </div>
            )}
          </div>
          </div>

          {/* ── Beautified Error/Success Alert ── */}
          {message && (
            <div
              className={`mt-2 flex items-start gap-3 border-2 p-4 $          {status === "success"
                  ? "border-[#22c55e] bg-[#22c55e]/10"
                  : messageType === "warning"
                    ? "border-[#eab308] bg-[#eab308]/10"
                    : "border-[#ef4444] bg-[#ef4444]/10"
              }`}
            >
              <div className="mt-0.5">
                {status === "success" ? (
                  <span className="text-[#22c55e]">✔</span>
                ) : messageType === "warning" ? (
                  <span className="text-[#eab308]">⚠</span>
                ) : (
                  <span className="animate-pulse text-[#ef4444]">⚠</span>
                )}
              </div>
              <div>
                <h4 className={`text-[10px] font-bold uppercase tracking-widest ${status === "success" ? "text-[#22c55e]" : messageType === "warning" ? "text-[#eab308]" : "text-[#ef4444]"}`}>
                  {status === "success" ? "SUCCESS" : messageType === "warning" ? "WARNING" : "ERROR"}
                </h4>
                <p className="mt-1 text-xs font-mono text-[#e8e8f0]">
                  {message}
                </p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="mt-2 border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1e40af] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "submitting"
              ? "SUBMITTING TO BLOCKCHAIN..."
              : status === "parsing"
                ? "PARSING AUCTION ID..."
                : nftPreview
                  ? "[ LIST NFT FOR AUCTION ]"
                  : "[ CREATE AUCTION ]"}
          </button>
        </form>
      </div>

      {/* Right Column: Hosted Auctions Feed */}
      <div className="flex flex-col gap-6 border-t-2 border-[#1e1e2e] pt-10 lg:border-l-2 lg:border-t-0 lg:pl-10 lg:pt-0">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8c8d8]">YOUR DEPLOYMENTS</h2>
        {myHostedAuctions.length === 0 ? (
          <div className="border-2 border-dashed border-[#1e1e2e] p-8 text-center">
            <p className="font-mono text-xs text-[#9898b0]">NO_ACTIVE_HOSTS</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {myHostedAuctions.map((auction) => {
              const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
              return (
                <Link href={`/auction/${auction.id}`} key={auction.id.toString()} className="group block border-2 border-[#1e1e2e] bg-[#0a0a0f] p-4 transition hover:border-[#3b82f6]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#e8e8f0]">ID #{auction.id.toString()}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isEnded ? "text-[#ef4444]" : "text-[#22c55e]"}`}>{isEnded ? "ENDED" : "LIVE"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] uppercase text-[#9898b0]">
                    <span>BIDS: {auction.highestBid > 0n ? "YES" : "NO"}</span>
                    <span className="text-[#3b82f6] opacity-0 transition group-hover:opacity-100">VIEW &rarr;</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CreateAuctionPage() {
  return (
    <Suspense fallback={
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-10 text-center">
          <p className="font-mono text-xs text-[#9898b0]">LOADING...</p>
        </div>
      </main>
    }>
      <CreateAuctionInner />
    </Suspense>
  );
}