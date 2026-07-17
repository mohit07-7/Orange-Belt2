"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import { formatAmount, formatDuration } from "@/lib/format";
import { CONTRACT_ADDRESS } from "@/lib/constants";
import { fetchNftMetadata, type NftMetadata } from "@/lib/nftMetadata";

interface Props { auctionId: bigint; }

function truncateAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function normalizeAddr(addr: string | null | undefined): string {
  return (addr || "").trim().toUpperCase();
}

function relativeTime(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - Math.floor(ts / 1000);
  if (diff < 5) return "JUST NOW";
  if (diff < 60) return diff + "s AGO";
  if (diff < 3600) return Math.floor(diff / 60) + "m AGO";
  return Math.floor(diff / 3600) + "h AGO";
}

function progressPercent(start: number, end: number) {
  const now = Date.now() / 1000;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
    </span>
  );
}

function UrgencyCountdown({ timeLeft, urgency }: { timeLeft: string; urgency: string }) {
  const cls = urgency === "critical" ? "text-[#ef4444] animate-urgency" : urgency === "warning" ? "text-[#eab308]" : urgency === "ended" ? "text-[#6b6b80]" : "text-[#e8e8f0]";
  return <div className={"text-4xl font-black tracking-widest transition-colors duration-500 " + cls}>{timeLeft}</div>;
}

function ProgressBar({ percent, urgency }: { percent: number; urgency: string }) {
  const cls = urgency === "critical" ? "bg-[#ef4444] animate-shimmer" : urgency === "warning" ? "bg-[#eab308]" : urgency === "ended" ? "bg-[#6b6b80]" : "bg-[#3b82f6]";
  return (
    <div className="h-1.5 w-full overflow-hidden border border-[#1e1e2e] bg-[#0a0a0f]">
      <div className={"h-full transition-all duration-1000 ease-linear " + cls} style={{ width: percent + "%" }} />
    </div>
  );
}

interface BidSnapshot {
  bidder: string;
  amount: string;
  timestamp: number;
}

function BidActivityTracker({ auction }: { auction: { highestBid: bigint; highestBidder: string; startTime: number; endTime: number } }) {
  const [snapshots, setSnapshots] = useState<BidSnapshot[]>([]);
  const prevBidRef = useRef(auction.highestBid.toString());
  const initializedRef = useRef(false);
  const [, setTick] = useState(0);

  // Auto-refresh relative timestamps every 10s
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(iv); }, []);

  // Single effect: initialize on first render if bid exists, then track changes
  useEffect(() => {
    const cur = auction.highestBid.toString();
    if (!initializedRef.current && auction.highestBid > 0n) {
      // First render with an existing bid — initialize snapshot
      initializedRef.current = true;
      prevBidRef.current = cur;
      setSnapshots([{ bidder: auction.highestBidder, amount: cur, timestamp: Date.now() }]);
    } else if (initializedRef.current && cur !== prevBidRef.current && auction.highestBid > 0n) {
      // Subsequent renders with a changed bid — append new snapshot
      prevBidRef.current = cur;
      setSnapshots(prev => [
        { bidder: auction.highestBidder, amount: cur, timestamp: Date.now() },
        ...prev,
      ].slice(0, 20));
    } else {
      prevBidRef.current = cur;
    }
  }, [auction.highestBid, auction.highestBidder]);

  const totalBidChanges = snapshots.length;
  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;

  return (
    <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">// BID ACTIVITY</h2>
        <div className="flex items-center gap-1.5">
          {!isEnded && <LiveDot />}
          <span className="font-mono text-[10px] text-[#9898b0]">{totalBidChanges} CHANGE{totalBidChanges !== 1 ? "S" : ""} DETECTED</span>
        </div>
      </div>

      {/* Status Summary */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="border border-[#1e1e2e] bg-[#0a0a0f] p-3 text-center">
          <p className="text-[9px] font-bold uppercase text-[#c8c8d8]">TOTAL CHANGES</p>
          <p className="mt-1 font-mono text-lg font-bold text-[#3b82f6]">{totalBidChanges}</p>
        </div>
        <div className="border border-[#1e1e2e] bg-[#0a0a0f] p-3 text-center">
          <p className="text-[9px] font-bold uppercase text-[#c8c8d8]">LATEST BIDDER</p>
          <p className="mt-1 font-mono text-[10px] text-[#e8e8f0]">{truncateAddr(auction.highestBidder)}</p>
        </div>
        <div className="border border-[#1e1e2e] bg-[#0a0a0f] p-3 text-center">
          <p className="text-[9px] font-bold uppercase text-[#c8c8d8]">STATUS</p>
          <p className={`mt-1 font-mono text-[10px] font-bold ${isEnded ? 'text-[#6b6b80]' : 'text-[#22c55e]'}`}>{isEnded ? 'ENDED' : 'ACTIVE'}</p>
        </div>
      </div>

      {/* Activity Log */}
      {snapshots.length === 0 ? (
        <div className="flex h-32 items-center justify-center border-2 border-dashed border-[#1e1e2e]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#9898b0]">NO BID CHANGES YET — MONITORING...</p>
        </div>
      ) : (
        <div className="flex h-48 flex-col gap-1 overflow-y-auto pr-1">
          {snapshots.map((snap, i) => (
            <div key={snap.timestamp + "-" + i} className={"flex items-center justify-between border border-[#1e1e2e] bg-[#0a0a0f] px-3 py-2 font-mono text-xs " + (i === 0 ? "border-[#3b82f6]/40 bg-[#3b82f6]/5" : "")}>
              <div className="flex items-center gap-2">
                <span className={"h-1.5 w-1.5 rounded-full " + (i === 0 ? "bg-[#22c55e]" : "bg-[#1e1e2e]")} />
                <span className="text-[#9898b0]">{truncateAddr(snap.bidder)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#3b82f6]">{formatAmount(BigInt(snap.amount))}</span>
                <span className="text-[10px] text-[#9898b0]">{relativeTime(snap.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (<div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">{label}</span><span className={"font-mono text-sm font-bold " + (color || "text-[#e8e8f0]")}>{value}</span></div>);
}

/** Detect wallet rejection / user cancellation errors */
function isWalletRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /cancel|reject|denied|dismissed/i.test(msg);
}

/** Map a caught error to a display-friendly message and type */
function classifyError(err: unknown): { message: string; type: "error" | "warning" } {
  if (isWalletRejection(err)) {
    return { message: "TRANSACTION REJECTED — NO CHANGES WERE MADE", type: "warning" };
  }
  const msg = err instanceof Error ? err.message : "UNKNOWN ERROR";
  return { message: msg.toUpperCase(), type: "error" };
}

export default function AuctionRoom({ auctionId }: Props) {
  const router = useRouter();
  const { address, triggerBalanceRefresh } = useWalletStore();
  const { isLoading, error, setError: clearGlobalError } = useAuctionStore();
  const { getAuctionDetails, placeBid, claimWinning, reclaimUnsold, cancelAuction, getTokenBalance } = useAuction();

  // Use local state so each auction page is isolated (prevents cross-contamination)
  const [auction, setAuctionLocal] = useState<AuctionDetails | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  // Claim diagnostics
  const [claimResult, setClaimResult] = useState<{ txHash: string; tokenAddr: string; wonBalance: string | null } | null>(null);

  const [bidAmount, setBidAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txMessageType, setTxMessageType] = useState<"error" | "warning">("error");
  const [timeLeft, setTimeLeft] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "critical" | "ended">("normal");
  const [progress, setProgress] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [bidFlash, setBidFlash] = useState(false);
  const [highestBidPop, setHighestBidPop] = useState(false);
  const prevHighestBidRef = useRef("0");

  // ── IPFS NFT Metadata ──
  const [nftMeta, setNftMeta] = useState<NftMetadata | null>(null);
  const [nftMetaLoading, setNftMetaLoading] = useState(false);
  const [nftImgError, setNftImgError] = useState(false);

  const refreshAuction = useCallback(async () => {
    const fresh = await getAuctionDetails(auctionId, { manageState: false });
    if (fresh) {
      setAuctionLocal(fresh);
      setLastSync(new Date());
    }
    setLocalLoading(false);
    return fresh;
  }, [auctionId, getAuctionDetails]);

  // Fetch auction on mount and when auctionId changes
  useEffect(() => {
    setAuctionLocal(null);
    setLocalLoading(true);
    refreshAuction();
  }, [refreshAuction]);

  // Fetch NFT metadata from IPFS when auction loads
  useEffect(() => {
    if (!auction) return;
    let cancelled = false;
    setNftMetaLoading(true);
    fetchNftMetadata(auction.token, auction.token_id)
      .then((meta) => { if (!cancelled) setNftMeta(meta); })
      .catch(() => { /* non-critical */ })
      .finally(() => { if (!cancelled) setNftMetaLoading(false); });
    return () => { cancelled = true; };
  }, [auction?.token, auction?.token_id]);

  // Auto-refresh auction state every 12s
  useEffect(() => {
    if (!auction) return;
    if (Math.floor(Date.now() / 1000) >= auction.endTime) return;
    const iv = setInterval(() => refreshAuction(), 12000);
    return () => clearInterval(iv);
  }, [auction?.endTime, refreshAuction]);



  // Detect new bids -> flash + pop animation
  useEffect(() => {
    if (!auction) return;
    const cur = auction.highestBid.toString();
    if (prevHighestBidRef.current !== "0" && prevHighestBidRef.current !== cur) {
      setBidFlash(true);
      setHighestBidPop(true);
      setTimeout(() => setBidFlash(false), 1200);
      setTimeout(() => setHighestBidPop(false), 500);
    }
    prevHighestBidRef.current = cur;
  }, [auction?.highestBid]);

  // Countdown + progress + urgency
  useEffect(() => {
    if (!auction) return;
    const iv = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auction.endTime - now;
      setProgress(progressPercent(auction.startTime, auction.endTime));
      if (diff <= 0) {
        setTimeLeft("AUCTION ENDED");
        setUrgency("ended");
        clearInterval(iv);
      } else {
        setTimeLeft(Math.floor(diff / 3600) + "h " + Math.floor((diff % 3600) / 60) + "m " + (diff % 60) + "s");
        setUrgency(diff <= 300 ? "critical" : diff <= 3600 ? "warning" : "normal");
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [auction]);



  // Compute minimum bid for client-side validation (independent of later derived vars)
  const increment = auction ? (auction.minBidIncrement > 0n ? auction.minBidIncrement : 1n) : 1n;
  const hasBids = auction ? auction.highestBid > 0n : false;
  const minBidBigInt = !auction ? 0n : hasBids ? auction.highestBid + increment : auction.startPrice + 1n;
  const parsedBidNum = bidAmount.trim() ? Number(bidAmount) : NaN;
  const parsedBidBigInt = isNaN(parsedBidNum) ? 0n : BigInt(Math.round(parsedBidNum * 10 ** 7));
  const isBidBelowMinimum = isNaN(parsedBidNum) || parsedBidBigInt < minBidBigInt;

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxMessageType("error");
    if (!address) return setTxMessage("CONNECT WALLET FIRST");
    if (isBidBelowMinimum) {
      setTxStatus("error");
      setTxMessage("BID MUST BE AT LEAST " + formatAmount(minBidBigInt));
      return;
    }
    const bidBigInt = BigInt(Math.round(parsedBidNum * 10 ** 7));
    setTxStatus("submitting");
    setTxMessage("");
    try {
      await placeBid(auctionId, bidBigInt);
      // 3-second delay for ledger settlement, then refetch auction + trigger balance refresh in Navbar
      await new Promise(r => setTimeout(r, 3000));
      await refreshAuction();
      triggerBalanceRefresh();
      setTxStatus("idle");
      setBidAmount("");
    } catch (err: unknown) {
      clearGlobalError(null);
      const { message, type } = classifyError(err);
      setTxMessageType(type);
      setTxMessage(message);
      setTxStatus(type === "warning" ? "idle" : "error");
    }
  };

  const handleClaim = async () => {
    setTxStatus("submitting");
    setTxMessage("");
    setTxMessageType("error");
    setClaimResult(null);
    try {
      const fresh = await getAuctionDetails(auctionId, { manageState: false });
      if (fresh?.claimed) { setTxStatus("error"); setTxMessage("ALREADY CLAIMED."); return; }
      if (!fresh || fresh.highestBid === 0n) { setTxStatus("error"); setTxMessage("NO BIDS TO CLAIM."); return; }

      // Pre-flight: check if contract actually holds the item token
      const contractBalance = await getTokenBalance(fresh.token, CONTRACT_ADDRESS);
      if (contractBalance !== null && contractBalance <= 0n) {
        setTxStatus("error");
        setTxMessage("THE CONTRACT DOES NOT HOLD THIS TOKEN. THE AUCTION CREATOR MAY NOT HAVE LOCKED IT PROPERLY DURING DEPLOYMENT.");
        return;
      }

      // Execute claim
      const txHash = await claimWinning(auctionId);

      // Post-flight: wait for ledger then check balance
      await new Promise(r => setTimeout(r, 4000));
      await refreshAuction();
      const balAfter = await getTokenBalance(fresh.token, fresh.highestBidder);

      // Build success diagnostics
      const wonBalance = balAfter !== null ? formatAmount(balAfter) : null;
      setClaimResult({ txHash, tokenAddr: fresh.token, wonBalance });
      triggerBalanceRefresh();
      setTxStatus("idle");
    } catch (err: unknown) {
      clearGlobalError(null);
      const { message, type } = classifyError(err);
      setTxMessageType(type);
      setTxMessage(message);
      setTxStatus(type === "warning" ? "idle" : "error");
    }
  };

  const handleReclaim = async () => {
    setTxStatus("submitting");
    setTxMessage("");
    setTxMessageType("error");
    try {
      const fresh = await getAuctionDetails(auctionId, { manageState: false });
      if (fresh?.claimed) { setTxStatus("error"); setTxMessage("ALREADY CLAIMED."); return; }
      await reclaimUnsold(auctionId);
      await refreshAuction();
      triggerBalanceRefresh();
      setTxStatus("idle");
    } catch (err: unknown) {
      clearGlobalError(null);
      const { message, type } = classifyError(err);
      setTxMessageType(type);
      setTxMessage(message);
      setTxStatus(type === "warning" ? "idle" : "error");
    }
  };

  // ── Cancel Auction (creator-only, no bids) ──────────────────────
  const handleCancel = async () => {
    setTxStatus("submitting");
    setTxMessage("");
    setTxMessageType("error");
    try {
      await cancelAuction(auctionId);
      // Wait 3 seconds for ledger settlement, then redirect
      await new Promise(r => setTimeout(r, 3000));
      triggerBalanceRefresh();
      router.push("/");
    } catch (err: unknown) {
      clearGlobalError(null);
      const { message, type } = classifyError(err);
      setTxMessageType(type);
      setTxMessage(message);
      setTxStatus(type === "warning" ? "idle" : "error");
    }
  };

  if ((isLoading || localLoading) && !auction) {
    return (<main className="flex flex-1 items-center justify-center p-10"><div className="flex items-center gap-3"><span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#3b82f6]" /><span className="font-mono text-xs font-bold uppercase tracking-widest text-[#9898b0]">SYNCING WITH LEDGER...</span></div></main>);
  }

  if (error || !auction) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-10">
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/10 p-8 text-center shadow-[6px_6px_0px_0px_#7f1d1d]">
          <p className="mb-2 font-mono text-lg font-bold text-[#ef4444]">!!</p>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#ef4444]">{error || "AUCTION NOT FOUND"}</p>
          <p className="mt-2 font-mono text-[10px] text-[#9898b0]">{"AUCTION #" + auctionId.toString() + " COULD NOT BE LOADED FROM THE LEDGER."}</p>
        </div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6] hover:underline">&lt; RETURN TO EXPLORE</Link>
      </main>
    );
  }

  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const isStarted = Math.floor(Date.now() / 1000) >= auction.startTime;
  const isCreator = normalizeAddr(address) === normalizeAddr(auction.creator);
  const isWinner = hasBids && normalizeAddr(address) === normalizeAddr(auction.highestBidder);
  const displayBid = hasBids ? auction.highestBid : auction.startPrice;
  const minBidStr = hasBids ? formatAmount(auction.highestBid + increment) : formatAmount(auction.startPrice + 1n);
  const statusBadge = isEnded ? "border-[#ef4444] text-[#ef4444]" : !isStarted ? "border-[#eab308] text-[#eab308]" : "border-[#22c55e] text-[#22c55e]";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:gap-8">

      {/* Status Bar */}
      <div className="flex items-center justify-between border-b-2 border-[#1e1e2e] pb-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#9898b0]">
          <LiveDot /><span>{isEnded ? "OFFLINE" : "LIVE"}</span><span className="text-[#1e1e2e]">|</span><span>LEDGER SYNC</span>
          {lastSync && <span className="text-[#9898b0]">{lastSync.toLocaleTimeString()}</span>}
        </div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-[#9898b0] transition hover:text-[#3b82f6]">&lt; BACK</Link>
      </div>

      {/* NFT Image + Title Display */}
      {nftMetaLoading ? (
        /* ── Loading Skeleton ── */
        <div className="flex items-center gap-5 border-2 border-[#1e1e2e] bg-[#0a0a0f] p-5">
          <div className="h-24 w-24 flex-shrink-0 animate-pulse bg-[#1e1e2e]" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-4 w-3/4 animate-pulse bg-[#1e1e2e]" />
            <div className="h-3 w-1/2 animate-pulse bg-[#1e1e2e]" />
            <div className="h-2 w-1/3 animate-pulse bg-[#1e1e2e]" />
          </div>
        </div>
      ) : nftMeta && (nftMeta.imageGateway || nftMeta.name !== "Untitled NFT") ? (
        /* ── Resolved IPFS Metadata ── */
        <div className="flex items-center gap-5 border-2 border-[#1e1e2e] bg-[#0a0a0f] p-5">
          {nftMeta.imageGateway && !nftImgError ? (
            <img
              src={nftMeta.imageGateway}
              alt={nftMeta.name}
              className="h-24 w-24 flex-shrink-0 border-2 border-[#1e1e2e] object-cover"
              onError={() => setNftImgError(true)}
            />
          ) : (
            <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center border-2 border-[#1e1e2e] bg-[#0e0e16]">
              <span className="text-2xl font-bold text-[#9898b0]">#{auction.token_id.toString()}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black uppercase tracking-tight text-[#e8e8f0] sm:text-2xl">{nftMeta.name}</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#9898b0]">{truncateAddr(auction.token) + " → ACCEPTS " + truncateAddr(auction.bidToken)}</p>
            {auction.isPrivate && (
              <span className="mt-1 inline-flex w-fit border border-[#a855f7] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#a855f7]">PRIVATE</span>
            )}
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-[#e8e8f0] sm:text-5xl">{nftMeta?.name && nftMeta.name !== "Untitled NFT" ? nftMeta.name : "AUCTION #" + auction.id.toString()}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#9898b0]">{"AUCTION #" + auction.id.toString() + " — " + truncateAddr(auction.token) + " → ACCEPTS " + truncateAddr(auction.bidToken)}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {auction.isPrivate && (
            <span className="border border-[#a855f7] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#a855f7]">PRIVATE</span>
          )}
          <div className={"flex items-center gap-2 border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest " + statusBadge}>
            {!isEnded && <LiveDot />}{isEnded ? "CLOSED" : !isStarted ? "PENDING" : "LIVE"}
          </div>
        </div>
      </div>

      {/* Countdown + Progress */}
      <div className={"border-2 border-[#1e1e2e] bg-[#0a0a0f] p-5 shadow-[8px_8px_0px_0px_#050508] " + (bidFlash ? "animate-bid-flash" : "")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">{isEnded ? "// SETTLED" : isStarted ? "// TIME REMAINING" : "// STARTS IN"}</h2>
          <span className="font-mono text-[10px] text-[#9898b0]">{formatDuration(Math.max(0, auction.endTime - auction.startTime))}</span>
        </div>
        <UrgencyCountdown timeLeft={timeLeft} urgency={urgency} />
        <div className="mt-3"><ProgressBar percent={progress} urgency={urgency} /></div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-5">

        {/* Left: Bid Data + Feed */}
        <div className="flex flex-col gap-6 lg:col-span-3">

          {/* Current Bid Card */}
          <div className={"border-2 border-[#1e1e2e] bg-[#0e0e16] p-6 transition-all " + (bidFlash ? "animate-bid-flash border-[#3b82f6]/40" : "")}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">// CURRENT HIGHEST BID</h2>
              <button onClick={refreshAuction} className="border border-[#1e1e2e] bg-[#0a0a0f] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#9898b0] transition hover:border-[#3b82f6] hover:text-[#3b82f6]">SYNC</button>
            </div>
            <div className={"font-mono text-5xl font-black text-[#3b82f6] transition-all " + (highestBidPop ? "animate-number-pop" : "")}>{formatAmount(displayBid)}</div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] uppercase text-[#9898b0]">{hasBids ? "HELD BY" : "STARTING PRICE"}</span>
              <span className="font-mono text-[10px] text-[#e8e8f0]">{hasBids ? truncateAddr(auction.highestBidder) : "NO BIDS YET"}</span>
              {hasBids && isWinner && <span className="border border-[#22c55e] px-1.5 py-0.5 text-[8px] font-bold uppercase text-[#22c55e]">YOU</span>}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 border-t-2 border-dashed border-[#1e1e2e] pt-4">
              <StatBox label="CREATOR" value={truncateAddr(auction.creator)} />
              <StatBox label="START PRICE" value={formatAmount(auction.startPrice)} color="text-[#9898b0]" />
              <StatBox label="BIDS" value={hasBids ? "1+" : "0"} color={hasBids ? "text-[#3b82f6]" : "text-[#9898b0]"} />
            </div>
          </div>

          {/* Bid Activity Tracker */}
          <BidActivityTracker auction={auction} />
        </div>

        {/* Right: Actions + Details */}
        <div className="flex flex-col gap-6 lg:col-span-2">

          {/* Action Panel */}
          <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-6 shadow-[8px_8px_0px_0px_#050508]">
            <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">// {isEnded ? "SETTLEMENT" : !isStarted ? "WAITING FOR START" : "PLACE YOUR BID"}</h2>

            {!isEnded && isStarted ? (
              <form onSubmit={handleBid} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#c8c8d8]">{"BID AMOUNT (MIN: " + minBidStr + ")"}</label>
                  <input type="text" placeholder="0.00" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3.5 font-mono text-lg font-bold text-[#e8e8f0] outline-none transition focus:border-[#3b82f6] focus:shadow-[4px_4px_0px_0px_#1e40af]" />
                </div>
                <button type="submit" disabled={txStatus === "submitting" || !bidAmount || isBidBelowMinimum} className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1e40af] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_0px_#1e40af]">
                  {txStatus === "submitting" ? <span className="flex items-center justify-center gap-2"><span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />SIGNING...</span> : "[ PLACE BID ]"}
                </button>
              </form>
            ) : !isStarted ? (
              /* ── Not yet started: show cancel button for creator if no bids ── */
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="font-mono text-xs text-[#eab308]">AUCTION HAS NOT STARTED YET</p>
                <p className="font-mono text-[10px] text-[#9898b0]">{"BEGINS " + new Date(auction.startTime * 1000).toLocaleString()}</p>
                {isCreator && !hasBids && (
                  <button onClick={handleCancel} disabled={txStatus === "submitting"} className="mt-3 border-2 border-[#ef4444] bg-[#ef4444]/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#ef4444] shadow-[4px_4px_0px_0px_#7f1d1d] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#7f1d1d] disabled:opacity-50">
                    {txStatus === "submitting" ? "SIGNING..." : "[ CANCEL AUCTION & RECLAIM NFT ]"}
                  </button>
                )}
              </div>
            ) : (
              /* ── ENDED STATE ────────────────────────────── */
              <div className="flex flex-col gap-4">
                {auction.claimed ? (
                  /* ── Already settled ────────────────────── */
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-lg text-[#9898b0]">done</p>
                    <p className="font-mono text-xs font-bold uppercase text-[#9898b0]">SETTLED</p>
                    <p className="font-mono text-[10px] text-[#9898b0]">THIS AUCTION HAS BEEN CLAIMED AND SETTLED ON-CHAIN.</p>
                    {hasBids && (
                      <div className="mt-2 border border-[#1e1e2e] p-3 text-center">
                        <p className="text-[10px] font-bold uppercase text-[#c8c8d8]">WINNER</p>
                        <p className="mt-1 font-mono text-xs text-[#3b82f6]">{truncateAddr(auction.highestBidder)}</p>
                      </div>
                    )}
                  </div>

                ) : isWinner ? (
                  /* ── YOU are the winner — claim your prize ── */
                  <div className="flex flex-col gap-3">
                    {claimResult ? (
                      /* ── Claim succeeded — show diagnostics ── */
                      <div className="flex flex-col gap-3">
                        <div className="border-2 border-[#22c55e] bg-[#22c55e]/5 p-4 shadow-[4px_4px_0px_0px_#15803d]">
                          <p className="text-sm font-bold uppercase text-[#22c55e]">CLAIM SUCCESSFUL</p>
                          <div className="mt-3 flex flex-col gap-2">
                            {claimResult.wonBalance && (
                              <div className="flex justify-between border-t border-dashed border-[#1e1e2e] pt-2">
                                <span className="text-[10px] uppercase text-[#9898b0]">YOUR BALANCE</span>
                                <span className="font-mono text-xs font-bold text-[#22c55e]">{claimResult.wonBalance} OF THIS TOKEN</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase text-[#9898b0]">TX HASH</span>
                              <span className="font-mono text-[10px] text-[#3b82f6]">{truncateAddr(claimResult.txHash)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border border-[#eab308]/30 bg-[#eab308]/5 p-3">
                          <p className="font-mono text-[10px] font-bold uppercase text-[#eab308]">NOT SEEING THE TOKEN IN YOUR WALLET?</p>
                          <p className="mt-1 font-mono text-[10px] text-[#9898b0]">ADD THIS ASSET MANUALLY USING THE CONTRACT ADDRESS:</p>
                          <p className="mt-1 break-all font-mono text-[10px] text-[#e8e8f0]">{claimResult.tokenAddr}</p>
                          <p className="mt-1 font-mono text-[10px] text-[#9898b0]">IN FREIGHTER: WALLET &rarr; ADD ASSET &rarr; CONTRACT ADDRESS</p>
                        </div>
                      </div>
                    ) : (
                      /* ── Pre-claim UI ── */
                      <div className="border-2 border-[#22c55e] bg-[#22c55e]/5 p-4 text-center shadow-[4px_4px_0px_0px_#15803d]">
                        <p className="text-sm font-bold uppercase text-[#22c55e]">YOU WON THIS AUCTION</p>
                        <p className="mt-1 font-mono text-[10px] text-[#9898b0]">PRIZE: {truncateAddr(auction.token)}</p>
                        <p className="mt-1 font-mono text-[10px] text-[#9898b0]">WINNING BID: {formatAmount(auction.highestBid)}</p>
                        <p className="mt-2 font-mono text-[10px] text-[#22c55e]">CLICK BELOW TO CLAIM YOUR ASSET ON-CHAIN</p>
                      </div>
                    )}
                    <button
                      onClick={handleClaim}
                      disabled={txStatus === "submitting"}
                      className="border-2 border-[#22c55e] bg-[#22c55e]/10 py-4 text-sm font-bold uppercase tracking-wider text-[#22c55e] shadow-[4px_4px_0px_0px_#15803d] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#15803d] disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      {txStatus === "submitting" ? "SIGNING..." : "[ CLAIM PRIZE ]"}
                    </button>
                  </div>

                ) : isCreator && !hasBids ? (
                  /* ── Creator reclaim — no bids ──────────── */
                  <div className="flex flex-col gap-3">
                    <div className="border border-[#eab308]/20 bg-[#eab308]/5 p-4 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#eab308]">NO BIDS PLACED</p>
                      <p className="mt-1 font-mono text-[10px] text-[#9898b0]">RECLAIM YOUR ASSET FROM THE CONTRACT</p>
                    </div>
                    <button onClick={handleReclaim} disabled={txStatus === "submitting"} className="border-2 border-[#eab308] bg-[#eab308]/10 py-4 text-sm font-bold uppercase tracking-wider text-[#eab308] shadow-[4px_4px_0px_0px_#854d0e] transition hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0">{txStatus === "submitting" ? "SIGNING..." : "[ RECLAIM ASSET ]"}</button>
                  </div>

                ) : hasBids ? (
                  /* ── Auction ended with bids — show winner + unclaimed notice ── */
                  <div className="flex flex-col gap-3">
                    <div className="border-2 border-[#3b82f6]/30 bg-[#3b82f6]/5 p-4 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#3b82f6]">AUCTION ENDED — PRIZE UNCLAIMED</p>
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex justify-between border-t border-dashed border-[#1e1e2e] pt-2">
                          <span className="text-[10px] uppercase text-[#9898b0]">WINNER</span>
                          <span className="font-mono text-xs font-bold text-[#3b82f6]">{truncateAddr(auction.highestBidder)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] uppercase text-[#9898b0]">WINNING BID</span>
                          <span className="font-mono text-xs font-bold text-[#e8e8f0]">{formatAmount(auction.highestBid)}</span>
                        </div>
                      </div>
                    </div>
                    {!address ? (
                      <div className="border border-[#eab308]/30 bg-[#eab308]/5 p-3 text-center">
                        <p className="font-mono text-[10px] font-bold uppercase text-[#eab308]">CONNECT THE WINNING WALLET TO CLAIM</p>
                        <p className="mt-1 font-mono text-[10px] text-[#9898b0]">THE WINNER MUST CONNECT THEIR WALLET AND CLICK CLAIM</p>
                      </div>
                    ) : !isWinner ? (
                      <div className="border border-[#eab308]/30 bg-[#eab308]/5 p-3 text-center">
                        <p className="font-mono text-[10px] font-bold uppercase text-[#eab308]">THIS IS NOT THE WINNING WALLET</p>
                        <p className="mt-1 font-mono text-[10px] text-[#9898b0]">CONNECT WALLET {truncateAddr(auction.highestBidder)} TO CLAIM THE PRIZE</p>
                      </div>
                    ) : null}
                  </div>

                ) : (
                  /* ── Ended with no bids at all ───────────── */
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="font-mono text-[10px] text-[#9898b0]">AUCTION ENDED — NO BIDS</p>
                    <p className="font-mono text-[10px] text-[#9898b0]">THIS AUCTION RECEIVED NO BIDS.</p>
                    {isCreator && (
                      <button onClick={handleCancel} disabled={txStatus === "submitting"} className="mt-3 border-2 border-[#ef4444] bg-[#ef4444]/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#ef4444] shadow-[4px_4px_0px_0px_#7f1d1d] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#7f1d1d] disabled:opacity-50">
                        {txStatus === "submitting" ? "SIGNING..." : "[ CANCEL AUCTION & RECLAIM NFT ]"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {txMessage && (
              <div className={`mt-4 border-2 px-4 py-3 ${txMessageType === "warning" ? "border-[#eab308] bg-[#eab308]/10" : "border-[#ef4444] bg-[#ef4444]/10"}`}>
                <p className={`font-mono text-[10px] font-bold uppercase tracking-wider ${txMessageType === "warning" ? "text-[#eab308]" : "text-[#ef4444]"}`}>{txMessage}</p>
              </div>
            )}
          </div>

          {/* Auction Details */}
          <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
            <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">// AUCTION DETAILS</h2>
            <div className="flex flex-col gap-3 font-mono text-xs">
              {[
                ["CREATOR", truncateAddr(auction.creator)],
                ["TOKEN", truncateAddr(auction.token)],
                ["BID TOKEN", truncateAddr(auction.bidToken)],
                ["START", new Date(auction.startTime * 1000).toLocaleString()],
                ["END", new Date(auction.endTime * 1000).toLocaleString()],
                ["MIN INCREMENT", formatAmount(increment) + " PER BID"],
                ...(hasBids ? [["WINNER", truncateAddr(auction.highestBidder)]] : [])
              ].map(([l, v], i) => (
                <div key={l} className={"flex justify-between " + (i > 0 ? "border-t border-dashed border-[#1e1e2e] pt-3" : "")}>
                  <span className="text-[#9898b0]">{l}</span>
                  <span className={l === "WINNER" ? "text-[#3b82f6]" : "text-[#e8e8f0]"}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
