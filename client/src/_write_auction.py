#!/usr/bin/env python3
import os

content = r'''"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import { formatAmount, formatDuration } from "@/lib/format";

interface Props { auctionId: bigint; }

function truncateAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
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

function BidHistoryFeed({ bids }: { bids: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(iv); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [bids.length]);
  if (bids.length === 0) {
    return (<div className="flex h-32 items-center justify-center border-2 border-dashed border-[#1e1e2e]"><p className="font-mono text-[10px] uppercase tracking-widest text-[#44445a]">AWAITING FIRST BID...</p></div>);
  }
  void tick;
  return (
    <div ref={scrollRef} className="flex h-48 flex-col gap-1 overflow-y-auto pr-1">
      {[...bids].reverse().map((bid, i) => (
        <div key={bid.timestamp + "-" + i} className={"flex items-center justify-between border border-[#1e1e2e] bg-[#0a0a0f] px-3 py-2 font-mono text-xs " + (i === 0 ? "animate-slide-in-right border-[#3b82f6]/40 bg-[#3b82f6]/5" : "")}>
          <div className="flex items-center gap-2">
            <span className={"h-1.5 w-1.5 rounded-full " + (i === 0 ? "bg-[#3b82f6]" : "bg-[#1e1e2e]")} />
            <span className="text-[#6b6b80]">{truncateAddr(bid.bidder)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#3b82f6]">{formatAmount(BigInt(bid.amount))}</span>
            <span className="text-[10px] text-[#44445a]">{relativeTime(bid.timestamp)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (<div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-widest text-[#44445a]">{label}</span><span className={"font-mono text-sm font-bold " + (color || "text-[#e8e8f0]")}>{value}</span></div>);
}

export default function AuctionRoom({ auctionId }: Props) {
  const { address } = useWalletStore();
  const { auction, isLoading, error, bidHistory } = useAuctionStore();
  const { getAuctionDetails, placeBid, claimWinning, reclaimUnsold, pollBidEvents } = useAuction();

  const [bidAmount, setBidAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [txMessage, setTxMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [progress, setProgress] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [bidFlash, setBidFlash] = useState(false);
  const [highestBidPop, setHighestBidPop] = useState(false);
  const prevHighestBidRef = useRef("0");

  const refreshAuction = useCallback(async () => {
    const fresh = await getAuctionDetails(auctionId);
    if (fresh) setLastSync(new Date());
    return fresh;
  }, [auctionId, getAuctionDetails]);

  useEffect(() => { refreshAuction(); }, [refreshAuction]);

  // Auto-refresh auction state every 12s
  useEffect(() => {
    if (!auction) return;
    if (Math.floor(Date.now() / 1000) >= auction.endTime) return;
    const iv = setInterval(() => refreshAuction(), 12000);
    return () => clearInterval(iv);
  }, [auction?.endTime, refreshAuction]);

  // Real-time event polling every 8s
  useEffect(() => {
    if (!auction) return;
    if (Math.floor(Date.now() / 1000) >= auction.endTime) return;
    pollBidEvents(auctionId.toString());
    const iv = setInterval(() => pollBidEvents(auctionId.toString()), 8000);
    return () => clearInterval(iv);
  }, [auction?.endTime, auctionId, pollBidEvents]);

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

  // Filter bids for this auction only
  const currentBids = bidHistory.filter(b => b.auctionId === auctionId.toString());

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return setTxMessage("CONNECT WALLET FIRST");
    const bidBigInt = BigInt(Math.round(Number(bidAmount) * 10 ** 7));
    setTxStatus("submitting");
    setTxMessage("");
    try {
      await placeBid(auctionId, bidBigInt);
      await new Promise(r => setTimeout(r, 2000));
      await refreshAuction();
      setTxStatus("idle");
      setBidAmount("");
    } catch (err: any) {
      setTxStatus("idle");
      setTxMessage(err.message.toUpperCase());
    }
  };

  const handleClaim = async () => {
    setTxStatus("submitting");
    setTxMessage("");
    try {
      const fresh = await getAuctionDetails(auctionId, { manageState: false });
      if (fresh?.claimed) { setTxStatus("error"); setTxMessage("ALREADY CLAIMED."); return; }
      if (!fresh || fresh.highestBid === 0n) { setTxStatus("error"); setTxMessage("NO BIDS TO CLAIM."); return; }
      await claimWinning(auctionId);
      await refreshAuction();
      setTxStatus("idle");
    } catch (err: any) {
      setTxStatus("idle");
      setTxMessage(err.message.toUpperCase());
    }
  };

  const handleReclaim = async () => {
    setTxStatus("submitting");
    setTxMessage("");
    try {
      const fresh = await getAuctionDetails(auctionId, { manageState: false });
      if (fresh?.claimed) { setTxStatus("error"); setTxMessage("ALREADY CLAIMED."); return; }
      await reclaimUnsold(auctionId);
      await refreshAuction();
      setTxStatus("idle");
    } catch (err: any) {
      setTxStatus("idle");
      setTxMessage(err.message.toUpperCase());
    }
  };

  if (isLoading && !auction) {
    return (<main className="flex flex-1 items-center justify-center p-10"><div className="flex items-center gap-3"><span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#3b82f6]" /><span className="font-mono text-xs font-bold uppercase tracking-widest text-[#6b6b80]">SYNCING WITH LEDGER...</span></div></main>);
  }

  if (error || !auction) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-10">
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/10 p-8 text-center shadow-[6px_6px_0px_0px_#7f1d1d]">
          <p className="mb-2 font-mono text-lg font-bold text-[#ef4444]">!!</p>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#ef4444]">{error || "AUCTION NOT FOUND"}</p>
          <p className="mt-2 font-mono text-[10px] text-[#6b6b80]">{"AUCTION #" + auctionId.toString() + " COULD NOT BE LOADED FROM THE LEDGER."}</p>
        </div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6] hover:underline">&lt; RETURN TO EXPLORE</Link>
      </main>
    );
  }

  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const isStarted = Math.floor(Date.now() / 1000) >= auction.startTime;
  const isCreator = address === auction.creator;
  const isWinner = address === auction.highestBidder;
  const hasBids = auction.highestBid > 0n;
  const displayBid = hasBids ? auction.highestBid : auction.startPrice;
  const minBidStr = hasBids ? formatAmount(auction.highestBid + 1n) : formatAmount(auction.startPrice);
  const statusBadge = isEnded ? "border-[#ef4444] text-[#ef4444]" : !isStarted ? "border-[#eab308] text-[#eab308]" : "border-[#22c55e] text-[#22c55e]";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:gap-8">

      {/* Status Bar */}
      <div className="flex items-center justify-between border-b-2 border-[#1e1e2e] pb-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">
          <LiveDot /><span>{isEnded ? "OFFLINE" : "LIVE"}</span><span className="text-[#1e1e2e]">|</span><span>LEDGER SYNC</span>
          {lastSync && <span className="text-[#6b6b80]">{lastSync.toLocaleTimeString()}</span>}
        </div>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b80] transition hover:text-[#3b82f6]">&lt; BACK</Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-[#e8e8f0] sm:text-5xl">{"AUCTION #" + auction.id.toString()}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#44445a]">{truncateAddr(auction.token) + " -> ACCEPTS " + truncateAddr(auction.bidToken)}</p>
        </div>
        <div className={"flex items-center gap-2 self-start border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest " + statusBadge}>
          {!isEnded && <LiveDot />}{isEnded ? "CLOSED" : !isStarted ? "PENDING" : "LIVE"}
        </div>
      </div>

      {/* Countdown + Progress */}
      <div className={"border-2 border-[#1e1e2e] bg-[#0a0a0f] p-5 shadow-[8px_8px_0px_0px_#050508] " + (bidFlash ? "animate-bid-flash" : "")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#44445a]">{isEnded ? "// SETTLED" : isStarted ? "// TIME REMAINING" : "// STARTS IN"}</h2>
          <span className="font-mono text-[10px] text-[#44445a]">{formatDuration(Math.max(0, auction.endTime - auction.startTime))}</span>
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
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#44445a]">// CURRENT HIGHEST BID</h2>
              <button onClick={refreshAuction} className="border border-[#1e1e2e] bg-[#0a0a0f] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b80] transition hover:border-[#3b82f6] hover:text-[#3b82f6]">SYNC</button>
            </div>
            <div className={"font-mono text-5xl font-black text-[#3b82f6] transition-all " + (highestBidPop ? "animate-number-pop" : "")}>{formatAmount(displayBid)}</div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] uppercase text-[#44445a]">{hasBids ? "HELD BY" : "STARTING PRICE"}</span>
              <span className="font-mono text-[10px] text-[#e8e8f0]">{hasBids ? truncateAddr(auction.highestBidder) : "NO BIDS YET"}</span>
              {hasBids && isWinner && <span className="border border-[#22c55e] px-1.5 py-0.5 text-[8px] font-bold uppercase text-[#22c55e]">YOU</span>}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 border-t-2 border-dashed border-[#1e1e2e] pt-4">
              <StatBox label="CREATOR" value={truncateAddr(auction.creator)} />
              <StatBox label="START PRICE" value={formatAmount(auction.startPrice)} color="text-[#6b6b80]" />
              <StatBox label="BIDS" value={currentBids.length > 0 ? String(currentBids.length) : hasBids ? "1+" : "0"} color={hasBids ? "text-[#3b82f6]" : "text-[#6b6b80]"} />
            </div>
          </div>

          {/* Live Bid Feed */}
          <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#44445a]">// LIVE BID FEED</h2>
              <div className="flex items-center gap-1.5">
                {!isEnded && <LiveDot />}
                <span className="font-mono text-[10px] text-[#44445a]">{currentBids.length} EVENT{currentBids.length !== 1 ? "S" : ""}</span>
              </div>
            </div>
            <BidHistoryFeed bids={currentBids} />
          </div>
        </div>

        {/* Right: Actions + Details */}
        <div className="flex flex-col gap-6 lg:col-span-2">

          {/* Action Panel */}
          <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-6 shadow-[8px_8px_0px_0px_#050508]">
            <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">// {isEnded ? "SETTLEMENT" : !isStarted ? "WAITING FOR START" : "PLACE YOUR BID"}</h2>

            {!isEnded && isStarted ? (
              <form onSubmit={handleBid} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#44445a]">{"BID AMOUNT (MIN: " + minBidStr + ")"}</label>
                  <input type="text" placeholder="0.00" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3.5 font-mono text-lg font-bold text-[#e8e8f0] outline-none transition focus:border-[#3b82f6] focus:shadow-[4px_4px_0px_0px_#1e40af]" />
                </div>
                <button type="submit" disabled={txStatus === "submitting" || !bidAmount} className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1e40af] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_0px_#1e40af]">
                  {txStatus === "submitting" ? <span className="flex items-center justify-center gap-2"><span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />SIGNING...</span> : "[ PLACE BID ]"}
                </button>
              </form>
            ) : !isStarted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="font-mono text-xs text-[#eab308]">AUCTION HAS NOT STARTED YET</p>
                <p className="font-mono text-[10px] text-[#44445a]">{"BEGINS " + new Date(auction.startTime * 1000).toLocaleString()}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {isWinner && hasBids && !auction.claimed ? (
                  <div className="flex flex-col gap-3">
                    <div className="border border-[#22c55e]/20 bg-[#22c55e]/5 p-4 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#22c55e]">YOU WON THIS AUCTION</p>
                      <p className="mt-1 font-mono text-[10px] text-[#6b6b80]">CLAIM YOUR PRIZE TO RECEIVE THE ASSET</p>
                    </div>
                    <button onClick={handleClaim} disabled={txStatus === "submitting"} className="border-2 border-[#22c55e] bg-[#22c55e]/10 py-4 text-sm font-bold uppercase tracking-wider text-[#22c55e] shadow-[4px_4px_0px_0px_#15803d] transition hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0">{txStatus === "submitting" ? "SIGNING..." : "[ CLAIM PRIZE ]"}</button>
                  </div>
                ) : isCreator && !hasBids && !auction.claimed ? (
                  <div className="flex flex-col gap-3">
                    <div className="border border-[#eab308]/20 bg-[#eab308]/5 p-4 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#eab308]">NO BIDS PLACED</p>
                      <p className="mt-1 font-mono text-[10px] text-[#6b6b80]">RECLAIM YOUR ASSET FROM THE CONTRACT</p>
                    </div>
                    <button onClick={handleReclaim} disabled={txStatus === "submitting"} className="border-2 border-[#eab308] bg-[#eab308]/10 py-4 text-sm font-bold uppercase tracking-wider text-[#eab308] shadow-[4px_4px_0px_0px_#854d0e] transition hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0">{txStatus === "submitting" ? "SIGNING..." : "[ RECLAIM ASSET ]"}</button>
                  </div>
                ) : auction.claimed ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="font-mono text-xs font-bold uppercase text-[#6b6b80]">SETTLED</p>
                    <p className="font-mono text-[10px] text-[#44445a]">THIS AUCTION HAS BEEN CLAIMED AND SETTLED ON-CHAIN.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-center"><p className="font-mono text-[10px] text-[#6b6b80]">SETTLED / INACTIVE</p></div>
                )}
              </div>
            )}
            {txMessage && <div className="mt-4 border-2 border-[#ef4444] bg-[#ef4444]/10 px-4 py-3"><p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#ef4444]">{txMessage}</p></div>}
          </div>

          {/* Auction Details */}
          <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
            <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#44445a]">// AUCTION DETAILS</h2>
            <div className="flex flex-col gap-3 font-mono text-xs">
              {[
                ["CREATOR", truncateAddr(auction.creator)],
                ["TOKEN", truncateAddr(auction.token)],
                ["BID TOKEN", truncateAddr(auction.bidToken)],
                ["START", new Date(auction.startTime * 1000).toLocaleString()],
                ["END", new Date(auction.endTime * 1000).toLocaleString()],
                ...(hasBids ? [["WINNER", truncateAddr(auction.highestBidder)]] : [])
              ].map(([l, v], i) => (
                <div key={l} className={"flex justify-between " + (i > 0 ? "border-t border-dashed border-[#1e1e2e] pt-3" : "")}>
                  <span className="text-[#44445a]">{l}</span>
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
'''

os.makedirs("src/components", exist_ok=True)
with open("src/components/AuctionRoom.tsx", "w", encoding="utf-8") as f:
    f.write(content)

lines = content.count("\n") + 1
print(f"Written {lines} lines to src/components/AuctionRoom.tsx")
