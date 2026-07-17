"use client";

import Link from "next/link";
import { type AuctionDetails } from "@/store/auctionStore";
import { formatAmount, formatDuration } from "@/lib/format";
import { useEffect, useState } from "react";

interface Props {
  auction: AuctionDetails;
}

function LiveDot() {
  return (
    <span className="relative inline-flex">
      <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-[#22c55e] opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
    </span>
  );
}

function ProgressBar({ percent, urgency }: { percent: number; urgency: string }) {
  const cls = urgency === "critical" ? "bg-[#ef4444] animate-shimmer" : urgency === "warning" ? "bg-[#eab308]" : urgency === "ended" ? "bg-[#6b6b80]" : "bg-[#3b82f6]";
  return (
    <div className="h-1 w-full overflow-hidden bg-[#1e1e2e]">
      <div className={"h-full transition-all duration-1000 ease-linear " + cls} style={{ width: percent + "%" }} />
    </div>
  );
}

export default function AuctionCard({ auction }: Props) {
  const [timeLeft, setTimeLeft] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "critical" | "ended">("normal");
  const [progress, setProgress] = useState(0);
  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const isStarted = Math.floor(Date.now() / 1000) >= auction.startTime;
  const hasBids = auction.highestBid > 0n;
  const bidCount = hasBids ? 1 : 0;
  const truncate = (str: string) => `${str.slice(0, 4)}...${str.slice(-4)}`;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auction.endTime - now;
      const totalDuration = auction.endTime - auction.startTime;
      const pct = totalDuration > 0 ? Math.min(100, Math.max(0, ((now - auction.startTime) / totalDuration) * 100)) : 100;
      setProgress(pct);

      if (diff <= 0) {
        setTimeLeft("ENDED");
        setUrgency("ended");
        clearInterval(interval);
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
        setUrgency(diff <= 300 ? "critical" : diff <= 3600 ? "warning" : "normal");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [auction.endTime, auction.startTime]);

  const statusBadge = isEnded ? "border-[#ef4444] text-[#ef4444]" : !isStarted ? "border-[#eab308] text-[#eab308]" : "border-[#22c55e] text-[#22c55e]";
  const statusText = isEnded ? "CLOSED" : !isStarted ? "PENDING" : "LIVE";

  const timerColor = urgency === "critical" ? "text-[#ef4444]" : urgency === "warning" ? "text-[#eab308]" : urgency === "ended" ? "text-[#6b6b80]" : "text-[#e8e8f0]";

  return (
    <Link
      href={`/auction/${auction.id.toString()}`}
      className="group relative flex flex-col border-2 border-[#1e1e2e] bg-[#0a0a0f] shadow-[4px_4px_0px_0px_#050508] transition hover:-translate-x-1 hover:-translate-y-1 hover:border-[#3b82f6] hover:shadow-[6px_6px_0px_0px_#1e40af]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e2e] px-5 py-3">
        <div className="flex items-center gap-2">
          {!isEnded && <LiveDot />}
          <span className="font-mono text-xs font-bold text-[#e8e8f0]">ID #{auction.id.toString()}</span>
        </div>
        <div className={"flex items-center gap-1.5 border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest " + statusBadge}>
          {statusText}
        </div>
      </div>

      {/* Main Stats */}
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#9898b0]">CURRENT BID</p>
          <p className="font-mono text-2xl font-black text-[#3b82f6]">{formatAmount(hasBids ? auction.highestBid : auction.startPrice)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">ASSET</span>
            <span className="font-mono text-xs text-[#e8e8f0]">{truncate(auction.token)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">BIDS</span>
            <span className={"font-mono text-xs font-bold " + (bidCount > 0 ? "text-[#3b82f6]" : "text-[#6b6b80]")}>{bidCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">DURATION</span>
            <span className="font-mono text-xs text-[#9898b0]">{formatDuration(Math.max(0, auction.endTime - auction.startTime))}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">BID TOKEN</span>
            <span className="font-mono text-xs text-[#9898b0]">{truncate(auction.bidToken)}</span>
          </div>
        </div>
      </div>

      {/* Footer: Progress + Timer */}
      <div className="mt-auto">
        <ProgressBar percent={progress} urgency={urgency} />
        <div className="flex items-center justify-between bg-[#0e0e16] px-5 py-3">
          <span className={"font-mono text-xs font-bold " + timerColor}>
            {isEnded ? "[ SETTLEMENT READY ]" : isStarted ? timeLeft : "PENDING"}
          </span>
          <span className="text-xs font-bold text-[#3b82f6] opacity-0 transition group-hover:opacity-100">
            ENTER &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}