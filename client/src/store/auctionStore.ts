"use client";

import { create } from "zustand";

export interface AuctionDetails {
  id: bigint;
  creator: string;
  token: string;
  token_id: bigint;
  bidToken: string;
  startPrice: bigint;
  minBidIncrement: bigint; // NEW: minimum increment between bids
  highestBid: bigint;
  highestBidder: string;
  startTime: number;
  endTime: number;
  ended: boolean;
  claimed: boolean;
  isPrivate: boolean;
  allowlist: string[];
}

interface AuctionState {
  /** Currently viewed auction details */
  auction: AuctionDetails | null;
  /** List of all known auctions (for home page) */
  auctions: AuctionDetails[];
  isLoading: boolean;
  error: string | null;

  setAuction: (details: AuctionDetails) => void;
  setAuctions: (auctions: AuctionDetails[]) => void;
  updateAuction: (details: AuctionDetails) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  auction: null,
  auctions: [],
  isLoading: false,
  error: null,
};

export const useAuctionStore = create<AuctionState>((set) => ({
  ...initialState,

  setAuction: (details) => set({ auction: details }),
  setAuctions: (auctions) => set({ auctions }),
  updateAuction: (details) =>
    set((state) => ({
      auctions: state.auctions.map((a) =>
        a.id === details.id ? details : a,
      ),
      auction: state.auction?.id === details.id ? details : state.auction,
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
