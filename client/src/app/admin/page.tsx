"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore, type AuctionDetails } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import { ADMIN_WALLET } from "@/lib/constants";
import { formatAmount } from "@/lib/format";

function truncateAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function AuctionRow({
  auction,
  onDelete,
  deletingId,
}: {
  auction: AuctionDetails;
  onDelete: (id: bigint) => void;
  deletingId: bigint | null;
}) {
  const isEnded = Math.floor(Date.now() / 1000) >= auction.endTime;
  const hasBids = auction.highestBid > 0n;
  const isDeleting = deletingId === auction.id;

  return (
    <div className="flex items-center justify-between border-2 border-[#1e1e2e] bg-[#0a0a0f] px-4 py-3 transition hover:border-[#ef4444]/40">
      <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <span className="font-mono text-xs font-bold text-[#e8e8f0]">
          #{auction.id.toString()}
        </span>
        <span className="hidden text-[#1e1e2e] sm:inline">|</span>
        <span className="font-mono text-[10px] text-[#9898b0]">
          {truncateAddr(auction.token)}
        </span>
        <span className="hidden text-[#1e1e2e] sm:inline">|</span>
        <span className="font-mono text-[10px] text-[#9898b0]">
          BID: {formatAmount(auction.highestBid)}
        </span>
        <span className="hidden text-[#1e1e2e] sm:inline">|</span>
        <span
          className={`font-mono text-[10px] font-bold ${
            isEnded ? "text-[#ef4444]" : "text-[#22c55e]"
          }`}
        >
          {isEnded ? "ENDED" : "LIVE"}
        </span>
        <span className="hidden text-[#1e1e2e] sm:inline">|</span>
        <span className="font-mono text-[10px] text-[#9898b0]">
          {hasBids ? "HAS BIDS" : "NO BIDS"}
        </span>
      </div>
      <button
        onClick={() => onDelete(auction.id)}
        disabled={isDeleting}
        className="border-2 border-[#ef4444] bg-[#ef4444]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ef4444] transition hover:bg-[#ef4444]/20 disabled:opacity-50"
      >
        {isDeleting ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin border-2 border-[#ef4444] border-t-transparent" />
            SIGNING...
          </span>
        ) : (
          "DELETE"
        )}
      </button>
    </div>
  );
}

export default function AdminPage() {
  const { address } = useWalletStore();
  const { auctions } = useAuctionStore();
  const { fetchAllAuctions, adminDeleteAuction } = useAuction();

  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<bigint | null>(null);
  const [confirmId, setConfirmId] = useState<bigint | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const isAdmin = address === ADMIN_WALLET;

  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      fetchAllAuctions().finally(() => setLoading(false));
    }
  }, [isAdmin, fetchAllAuctions]);

  const handleDelete = useCallback(
    async (auctionId: bigint) => {
      if (!address) return;

      if (confirmId !== auctionId) {
        setConfirmId(auctionId);
        setMessage(`CLICK DELETE AGAIN ON AUCTION #${auctionId} TO CONFIRM`);
        setStatus("idle");
        return;
      }

      setDeletingId(auctionId);
      setConfirmId(null);
      setMessage("");

      try {
        const txHash = await adminDeleteAuction(address, auctionId);
        setStatus("success");
        setMessage(
          `AUCTION #${auctionId} DELETED. TX: ${txHash.slice(0, 12)}...`
        );
        await fetchAllAuctions();
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : "UNKNOWN ERROR";
        const isRejection = /cancel|reject|denied|dismissed/i.test(rawMsg);
        setStatus("error");
        setMessage(
          isRejection
            ? "TRANSACTION REJECTED"
            : rawMsg.toUpperCase()
        );
      } finally {
        setDeletingId(null);
      }
    },
    [address, confirmId, adminDeleteAuction, fetchAllAuctions]
  );

  // ── Not connected ────────────────────────────────────────
  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="brutal-static border-2 border-[#1e1e2e] bg-[#0e0e16] p-10 text-center">
          <p className="font-mono text-xs text-[#9898b0]">
            WALLET_NOT_CONNECTED
          </p>
        </div>
      </main>
    );
  }

  // ── Not admin — access denied ────────────────────────────
  if (!isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/10 p-10 text-center shadow-[6px_6px_0px_0px_#7f1d1d]">
          <p className="mb-2 font-mono text-lg font-bold text-[#ef4444]">
            !!
          </p>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#ef4444]">
            ACCESS DENIED
          </p>
          <p className="mt-2 font-mono text-[10px] text-[#9898b0]">
            THIS WALLET DOES NOT HAVE ADMINISTRATIVE PRIVILEGES.
          </p>
          <p className="mt-1 font-mono text-[10px] text-[#9898b0]">
            CONNECTED: {truncateAddr(address)}
          </p>
        </div>
        <Link
          href="/"
          className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6] hover:underline"
        >
          &lt; RETURN TO EXPLORE
        </Link>
      </main>
    );
  }

  // ── Admin panel ──────────────────────────────────────────
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
          // ADMIN PANEL
        </h1>
        <p className="mt-1 text-xs text-[#9898b0]">
          Manage all auctions. Connected as admin.
        </p>
      </div>

      {/* Admin wallet badge */}
      <div className="border-2 border-[#22c55e] bg-[#22c55e]/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#22c55e]">
              ADMIN AUTHORIZED
            </span>
          </div>
          <span className="font-mono text-xs text-[#e8e8f0]">
            {truncateAddr(address)}
          </span>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`flex items-start gap-3 border-2 p-4 ${
            status === "success"
              ? "border-[#22c55e] bg-[#22c55e]/10"
              : status === "error"
                ? "border-[#ef4444] bg-[#ef4444]/10"
                : "border-[#eab308] bg-[#eab308]/10"
          }`}
        >
          <div className="mt-0.5">
            {status === "success" ? (
              <span className="text-[#22c55e]">&#10003;</span>
            ) : status === "error" ? (
              <span className="animate-pulse text-[#ef4444]">&#9888;</span>
            ) : (
              <span className="text-[#eab308]">&#9888;</span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-mono text-[#e8e8f0]">{message}</p>
          </div>
          <button
            onClick={() => {
              setMessage("");
              setStatus("idle");
              setConfirmId(null);
            }}
            className="border border-[#1e1e2e] bg-[#0e0e16] px-2 py-1 text-[10px] font-bold uppercase text-[#9898b0] transition hover:text-[#e8e8f0]"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Auction list */}
      <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8c8d8]">
            // ALL AUCTIONS ({auctions.length})
          </h2>
          <button
            onClick={() => {
              setLoading(true);
              fetchAllAuctions().finally(() => setLoading(false));
            }}
            disabled={loading}
            className="border-2 border-[#1e1e2e] bg-[#0a0a0f] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9898b0] transition hover:border-[#3b82f6] hover:text-[#3b82f6] disabled:opacity-50"
          >
            {loading ? "SCANNING..." : "REFRESH"}
          </button>
        </div>

        {loading && auctions.length === 0 ? (
          <div className="flex items-center justify-center gap-3 p-12">
            <span className="inline-block h-4 w-4 animate-spin border-2 border-[#44445a] border-t-[#3b82f6]" />
            <span className="text-xs font-bold uppercase text-[#9898b0]">
              SCANNING LEDGER...
            </span>
          </div>
        ) : auctions.length === 0 ? (
          <div className="border-2 border-dashed border-[#1e1e2e] p-8 text-center">
            <p className="font-mono text-xs text-[#9898b0]">
              NO AUCTIONS FOUND
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[...auctions]
              .sort((a, b) => Number(b.id - a.id))
              .map((auction) => (
                <AuctionRow
                  key={auction.id.toString()}
                  auction={auction}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
