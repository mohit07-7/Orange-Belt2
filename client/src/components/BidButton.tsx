"use client";

import { useState } from "react";

interface BidButtonProps {
  onBid: (amount: string) => Promise<void>;
  disabled?: boolean;
  minAmount?: string;
}

export default function BidButton({
  onBid,
  disabled = false,
  minAmount,
}: BidButtonProps) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleBid = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatus("error");
      setMessage("INVALID AMOUNT");
      return;
    }

    setStatus("signing");
    setMessage("");

    try {
      await onBid(amount);
      setStatus("success");
      setMessage("BID PLACED SUCCESSFULLY");
      setAmount("");
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 4000);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message.toUpperCase() : "TRANSACTION FAILED",
      );
    }
  };

  return (
    <div className="space-y-3">
      {/* Input row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
            YOUR BID
            {minAmount && (
              <span className="ml-2 text-[#3b82f6]">
                [MIN: {minAmount}]
              </span>
            )}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (status === "error" || status === "success") {
                setStatus("idle");
                setMessage("");
              }
            }}
            placeholder="0.00"
            disabled={status === "signing" || disabled}
            className="w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3 text-lg font-bold text-[#e8e8f0] outline-none transition placeholder:text-[#44445a] disabled:opacity-50"
          />
        </label>

        <button
          onClick={handleBid}
          disabled={status === "signing" || disabled}
          className="h-[50px] border-2 border-[#3b82f6] bg-[#3b82f6] px-8 text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_0px_#1e40af] transition hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "signing" ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin border-2 border-white border-t-transparent" />
              SIGNING...
            </span>
          ) : (
            "[ PLACE BID ]"
          )}
        </button>
      </div>

      {/* Status */}
      {message && (
        <div
          className={`border-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${
            status === "success"
              ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
              : status === "error"
                ? "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
                : ""
          }`}
        >
          {status === "success" ? "[OK] " : "[ERR] "}
          {message}
        </div>
      )}
    </div>
  );
}
