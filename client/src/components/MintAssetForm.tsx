"use client";

import { useState, useCallback, useRef, type DragEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useNftMint, type MintPhase } from "@/hooks/useNftMint";

// ── Types ──────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  file: File | null;
}

interface DragState {
  isDragging: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_SIZE_MB = 10;

function isAccepted(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_SIZE_MB * 1024 * 1024;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Step indicator ─────────────────────────────────────────────────────

const STEPS = [
  { key: "uploading", label: "IPFS", description: "Pin asset to IPFS" },
  { key: "initializing", label: "INIT", description: "Initialize NFT contract" },
  { key: "minting", label: "SIGN", description: "Sign mint transaction" },
  { key: "confirming", label: "LEDGER", description: "Await confirmation" },
] as const;

const PHASE_ORDER: MintPhase[] = ["idle", "uploading", "initializing", "minting", "confirming", "success", "error"];

function stepStatus(stepKey: string, currentPhase: MintPhase) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const stepIdx = PHASE_ORDER.findIndex(
    (p) => p === stepKey || (stepKey === "uploading" && p === "uploading"),
  );

  if (currentPhase === "error") return "error";
  if (currentPhase === "success") return "done";
  if (currentIdx > stepIdx) return "done";
  if (currentIdx === stepIdx) return "active";
  return "pending";
}

// ── Main Component ─────────────────────────────────────────────────────

export default function MintAssetForm() {
  const { phase, phaseLabel, result, error, mint, reset } = useNftMint();

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    file: null,
  });
  const [drag, setDrag] = useState<DragState>({ isDragging: false });
  const [preview, setPreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = phase !== "idle" && phase !== "success" && phase !== "error";

  // ── File handling ──────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setValidationError(null);
    if (!isAccepted(file)) {
      setValidationError(
        `INVALID FILE: ACCEPTS PNG, JPEG, WEBP, GIF UNDER ${MAX_SIZE_MB} MB`,
      );
      return;
    }
    setForm((prev) => ({ ...prev, file }));
    const url = URL.createObjectURL(file);
    setPreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDrag({ isDragging: false });
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag({ isDragging: true });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDrag({ isDragging: false });
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const removeFile = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setForm((prev) => ({ ...prev, file: null }));
    setPreview(null);
    setValidationError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [preview]);

  // ── Submit ─────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setValidationError(null);

      if (!form.file) {
        setValidationError("PLEASE SELECT AN IMAGE FILE");
        return;
      }
      if (!form.title.trim()) {
        setValidationError("TITLE IS REQUIRED");
        return;
      }

      try {
        await mint(form.title.trim(), form.description.trim(), form.file);
      } catch {
        // Error state is managed by the hook
      }
    },
    [form, mint],
  );

  // ── Input class ────────────────────────────────────────────────

  const inputClass =
    "w-full border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-3.5 font-mono text-sm text-[#e8e8f0] outline-none transition placeholder:text-[#44445a] disabled:opacity-50 focus:border-[#3b82f6]";

  // ── Not connected state ────────────────────────────────────────

  return (
    <div className="flex w-full flex-col gap-8">
      {/* ── Step Indicator ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const status = stepStatus(step.key, phase);
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px flex-1 transition-colors duration-300 ${
                    status === "done" || status === "active"
                      ? "bg-[#3b82f6]"
                      : "bg-[#1e1e2e]"
                  }`}
                  style={{ minWidth: 24 }}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center border-2 text-[10px] font-bold transition-all duration-300 ${
                    status === "done"
                      ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                      : status === "active"
                        ? "border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6] animate-pulse-ring"
                        : status === "error"
                          ? "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
                          : "border-[#1e1e2e] bg-[#0e0e16] text-[#9898b0]"
                  }`}
                >
                  {status === "done" ? "✔" : status === "active" ? "..." : step.label[0]}
                </div>
                <div className="hidden flex-col sm:flex">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      status === "active" ? "text-[#3b82f6]" : status === "done" ? "text-[#22c55e]" : "text-[#9898b0]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main Card ──────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left: Drop zone + preview */}
          <div className="flex flex-1 flex-col gap-4">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isBusy && fileInputRef.current?.click()}
              className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed transition-all duration-200 ${
                drag.isDragging
                  ? "border-[#3b82f6] bg-[#3b82f6]/5"
                  : form.file
                    ? "border-[#22c55e] bg-[#22c55e]/5"
                    : "border-[#1e1e2e] bg-[#0a0a0f] hover:border-[#3b82f6] hover:bg-[#3b82f6]/5"
              } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
              style={{ minHeight: 280 }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={handleInputChange}
                disabled={isBusy}
                className="hidden"
              />

              {preview ? (
                <>
                  <div className="relative flex h-full w-full items-center justify-center p-4">
                    <Image
                      src={preview}
                      alt="Asset preview"
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      unoptimized
                    />
                  </div>
                  {!isBusy && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                      className="absolute right-3 top-3 border-2 border-[#1e1e2e] bg-[#0a0a0f] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ef4444] transition hover:border-[#ef4444]"
                    >
                      REMOVE
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 p-10 text-center">
                  {/* Upload icon */}
                  <div className="flex h-16 w-16 items-center justify-center border-2 border-[#1e1e2e] bg-[#0e0e16] transition group-hover:border-[#3b82f6]">
                    <svg
                      className="h-7 w-7 text-[#6b6b80] transition group-hover:text-[#3b82f6]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#9898b0]">
                      DRAG & DROP ASSET IMAGE
                    </p>
                    <p className="mt-1 text-[10px] text-[#9898b0]">
                      PNG, JPEG, WEBP, GIF — MAX {MAX_SIZE_MB} MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* File info */}
            {form.file && (
              <div className="animate-slide-in-right flex items-center justify-between border-2 border-[#1e1e2e] bg-[#0e0e16] px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#22c55e]">
                    ✔ FILE READY
                  </span>
                  <span className="text-[10px] text-[#9898b0]">
                    {form.file.name}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#9898b0]">
                  {formatSize(form.file.size)}
                </span>
              </div>
            )}
          </div>

          {/* Right: Metadata fields */}
          <div className="flex flex-1 flex-col gap-5">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                TITLE *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="MY AWESOME NFT"
                disabled={isBusy}
                className={inputClass}
                maxLength={64}
              />
              <p className="mt-1 text-[10px] text-[#9898b0]">
                {form.title.length}/64 CHARACTERS
              </p>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                DESCRIPTION
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="OPTIONAL DESCRIPTION STORED ON-CHAIN VIA IPFS..."
                disabled={isBusy}
                rows={4}
                maxLength={500}
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1 text-[10px] text-[#9898b0]">
                {form.description.length}/500 CHARACTERS
              </p>
            </div>

            {/* IPFS info box */}
            <div className="border-2 border-[#1e1e2e] bg-[#0e0e16] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                WHAT HAPPENS NEXT
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {[
                  "Image pinned to IPFS via Pinata",
                  "ERC-721 metadata JSON created & pinned",
                  "NFT contract initialized (first-time only)",
                  "Soroban NFT minted with metadata URI",
                  "Token ID returned on success",
                ].map((step) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#3b82f6]">&gt;</span>
                    <span className="text-[10px] text-[#9898b0]">{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Validation error ────────────────────────────────── */}
        {validationError && (
          <div className="animate-slide-in-right flex items-start gap-3 border-2 border-[#ef4444] bg-[#ef4444]/10 p-4">
            <span className="mt-0.5 animate-pulse text-[#ef4444]">⚠</span>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
                VALIDATION ERROR
              </h4>
              <p className="mt-1 font-mono text-xs text-[#e8e8f0]">
                {validationError}
              </p>
            </div>
          </div>
        )}

        {/* ── Phase error ─────────────────────────────────────── */}
        {phase === "error" && error && (
          <div className="animate-slide-in-right flex items-start gap-3 border-2 border-[#ef4444] bg-[#ef4444]/10 p-4">
            <span className="mt-0.5 animate-pulse text-[#ef4444]">⚠</span>
            <div className="flex-1">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
                TRANSACTION REJECTED
              </h4>
              <p className="mt-1 font-mono text-xs text-[#e8e8f0]">{error}</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="border-2 border-[#ef4444] bg-[#ef4444]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ef4444] transition hover:bg-[#ef4444]/20"
            >
              RETRY
            </button>
          </div>
        )}

        {/* ── Success state ───────────────────────────────────── */}
        {phase === "success" && result && (
          <div className="animate-slide-in-right flex flex-col gap-4 border-2 border-[#22c55e] bg-[#22c55e]/10 p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#22c55e]">✔</span>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#22c55e]">
                  NFT MINTED SUCCESSFULLY
                </h4>
                <p className="mt-1 font-mono text-xs text-[#e8e8f0]">
                  TOKEN #{result.tokenId}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                  TOKEN ID
                </p>
                <p className="mt-1 truncate font-mono text-xs text-[#3b82f6]">
                  {result.tokenId}
                </p>
              </div>
              <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                  TX HASH
                </p>
                <p className="mt-1 truncate font-mono text-xs text-[#3b82f6]">
                  {result.txHash}
                </p>
              </div>
              <div className="border-2 border-[#1e1e2e] bg-[#0a0a0f] p-3 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c8c8d8]">
                  METADATA URI
                </p>
                <p className="mt-1 break-all font-mono text-xs text-[#3b82f6]">
                  {result.metadataUri}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-[3px_3px_0px_0px_#1e40af] transition hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#1e40af]"
              >
                MINT ANOTHER
              </button>
              <Link
                href={`/create?tokenId=${result.tokenId}&hash=${result.imageGateway.replace("https://gateway.pinata.cloud/ipfs/", "")}`}
                className="flex items-center justify-center border-2 border-[#22c55e] bg-[#22c55e]/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#22c55e] transition hover:bg-[#22c55e]/20"
              >
                CREATE AUCTION WITH THIS NFT &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* ── Submit button ───────────────────────────────────── */}
        {phase !== "success" && (
          <button
            type="submit"
            disabled={isBusy || !form.file || !form.title.trim()}
            className="border-2 border-[#3b82f6] bg-[#3b82f6] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1e40af] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_#1e40af] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-block h-4 w-4 animate-spin border-2 border-white border-t-transparent" />
                {phaseLabel}
              </span>
            ) : (
              `[ MINT NFT ]`
            )}
          </button>
        )}
      </form>
    </div>
  );
}
