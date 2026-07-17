"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWalletStore } from "@/store/walletStore";
import { useAuctionStore } from "@/store/auctionStore";
import { useAuction } from "@/hooks/useAuction";
import AuctionCard from "@/components/AuctionCard";


export default function Home() {
  const { address, isConnecting } = useWalletStore();
  const connect = useWalletStore((s) => s.connect);
  const { auctions, isLoading, error } = useAuctionStore();
  const { fetchAllAuctions } = useAuction();
  
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (address) {
      fetchAllAuctions().then(() => setHasLoaded(true));
    }
  }, [address, fetchAllAuctions]);

  // ── Landing page (disconnected) ──────────────────────────────
  if (!address) {
    return (
      <>
        <main className="flex flex-1 flex-col">
          {/* Hero */}
          <section className="relative flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
            {/* Terminal-style top bar */}
            <div className="absolute left-0 top-0 flex w-full items-center gap-2 border-b-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-2">
              <span className="h-2.5 w-2.5 bg-[#ef4444]" />
              <span className="h-2.5 w-2.5 bg-[#eab308]" />
              <span className="h-2.5 w-2.5 bg-[#22c55e]" />
              <span className="ml-4 font-mono text-xs text-[#9898b0]">
                zenith@stellar:~$
              </span>
            </div>
            <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8 pt-12">
              {/* Tag */}
              <div className="animate-fade-up flex items-center gap-2 border-2 border-[#22c55e] bg-[#22c55e]/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#22c55e]">
                <span className="live-dot" />
                LIVE ON STELLAR TESTNET
              </div>

              {/* Headline */}
              <h1 className="animate-fade-up-1 text-5xl font-bold uppercase leading-[0.9] tracking-tighter sm:text-7xl md:text-8xl">
                <span className="block text-[#e8e8f0]">BID ON</span>
                <span className="block text-[#3b82f6]">ANYTHING</span>
                <span className="block text-[#e8e8f0]">ON-CHAIN</span>
              </h1>

              {/* Sub */}
              <p className="animate-fade-up-2 max-w-lg text-sm leading-relaxed text-[#9898b0]">
                Trustless auctions powered by Soroban smart contracts.
                <br />
                Create. Bid. Settle. No intermediaries.
              </p>

              {/* CTA */}
              <button
                onClick={() => connect()} // <-- Direct connect via Stellar Wallets Kit
                disabled={isConnecting}
                className="animate-fade-up-3 mt-2 border-2 border-[#3b82f6] bg-[#3b82f6] px-8 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-brutal-accent transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-brutal-accent-lg disabled:opacity-60"
              >
                {isConnecting ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin border-2 border-white border-t-transparent" />
                    CONNECTING...
                  </span>
                ) : (
                  "[ CONNECT WALLET ]"
                )}
              </button>

              {/* Updated helper text for multi-wallet */}
              <p className="animate-fade-up-4 text-xs text-[#9898b0]">
                supports freighter, xbull & albedo
              </p>
            </div>
          </section>

          {/* Features strip */}
          <section className="border-t-2 border-[#1e1e2e]">
            <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-3">
              {[
                {
                  label: "01",
                  title: "CREATE",
                  desc: "List any Soroban token with custom start prices and durations.",
                },
                {
                  label: "02",
                  title: "BID",
                  desc: "Compete in real-time. Previous bidders get refunded instantly.",
                },
                {
                  label: "03",
                  title: "SETTLE",
                  desc: "Winners claim via smart contract. Fully trustless execution.",
                },
              ].map((f, i) => (
                <div
                  key={f.title}
                  className={`flex flex-col gap-3 p-8 ${
                    i < 2 ? "border-r-2 border-[#1e1e2e]" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-[#3b82f6]">
                    [{f.label}]
                  </span>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8e8f0]">
                    {f.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#9898b0]">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>

      </>
    );
  }

  // ── Auction listing (connected) ──────────────────────────────
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Header */}
      <section className="brutal-static p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-[#e8e8f0]">
              // LIVE AUCTIONS
            </h1>
            <p className="mt-1 text-xs text-[#9898b0]">
              {auctions.length} auction{auctions.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <Link
            href="/create"
            className="inline-flex items-center justify-center border-2 border-[#3b82f6] bg-[#3b82f6] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-brutal-accent transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-brutal-accent-lg"
          >
            + NEW AUCTION
          </Link>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="border-2 border-[#ef4444] bg-[#ef4444]/5 p-4">
          <p className="text-xs font-bold uppercase text-[#ef4444]">
            [ERROR] {error}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !hasLoaded && (
        <div className="flex items-center justify-center gap-3 p-12">
          <span className="inline-block h-4 w-4 animate-spin border-2 border-[#44445a] border-t-[#3b82f6]" />
          <span className="text-xs font-bold uppercase text-[#9898b0]">
            Loading...
          </span>
        </div>
      )}

      {/* Auction grid */}
      {hasLoaded && auctions.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[#c8c8d8]">
            // ALL AUCTIONS
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...auctions]
              .sort((a, b) => Number(b.id - a.id))
              .map((auction) => (
                <AuctionCard key={auction.id.toString()} auction={auction} />
              ))}
          </div>
        </section>
      )}

      {/* Empty */}
      {hasLoaded && auctions.length === 0 && (
        <section className="flex flex-col items-center gap-4 border-2 border-dashed border-[#1e1e2e] bg-[#0e0e16] p-16 text-center">
          <p className="font-mono text-xs text-[#9898b0]">
            NO_AUCTIONS_FOUND
          </p>
          <p className="text-sm font-bold text-[#9898b0]">
            No auctions yet. Create the first one.
          </p>
          <Link
            href="/create"
            className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-brutal-accent transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-brutal-accent-lg"
          >
            + NEW AUCTION
          </Link>
        </section>
      )}
    </main>
  );
}