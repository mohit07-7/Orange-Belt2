"use client";

import { useCallback, useState } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useNftStore } from "@/store/nftStore";
import {
  NETWORK,
  NFT_CONTRACT_ADDRESS,
} from "@/lib/constants";

import {
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
} from "@stellar/stellar-sdk";

const { Server, assembleTransaction } = rpc;

// ── Types ──────────────────────────────────────────────────────────────

export type MintPhase =
  | "idle"
  | "uploading"
  | "initializing"
  | "minting"
  | "confirming"
  | "success"
  | "error";

export interface MintResult {
  tokenId: string;
  txHash: string;
  metadataUri: string;
  imageGateway: string;
}

export interface UploadResult {
  imageUri: string;
  imageGateway: string;
  metadataUri: string;
  metadataGateway: string;
}

interface UseNftMintReturn {
  phase: MintPhase;
  phaseLabel: string;
  result: MintResult | null;
  error: string | null;
  mint: (title: string, description: string, file: File) => Promise<MintResult>;
  burnNft: (tokenId: string) => Promise<string>;
  adminBurnNft: (tokenId: string) => Promise<string>;
  initializeContract: () => Promise<string>;
  reset: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function getServer() {
  if (!NETWORK.rpcUrl) return null;
  return new Server(NETWORK.rpcUrl, { allowHttp: true });
}

function getNftContract(): Contract | null {
  if (!NFT_CONTRACT_ADDRESS) return null;
  return new Contract(NFT_CONTRACT_ADDRESS);
}

/** Parse complex ledger rejection structures into human-readable strings. */
function parseLedgerError(raw: string): string {
  const err = raw.toUpperCase();

  if (err.includes("CANCELLED") || err.includes("CANCELED"))
    return "TRANSACTION CANCELLED BY USER.";
  if (err.includes("NOTINITIALIZED"))
    return "NFT CONTRACT NOT INITIALIZED. CONTACT ADMIN.";
  if (err.includes("ALREADYINITIALIZED"))
    return "NFT CONTRACT ALREADY INITIALIZED. SKIPPING SETUP.";
  if (err.includes("NOTAUTHORIZED"))
    return "NOT AUTHORIZED: YOU MUST BE THE CONTRACT ADMIN TO MINT.";
  if (err.includes("TIMEOUT") || err.includes("NETWORK"))
    return "NETWORK TIMEOUT: THE STELLAR NETWORK TOOK TOO LONG TO RESPOND.";
  if (err.includes("INSUFFICIENT"))
    return "INSUFFICIENT FUNDS FOR TRANSACTION FEE.";
  if (err.includes("SIMULATIONFAILED"))
    return "SIMULATION FAILED: THE CONTRACT REJECTED THIS MINT.";

  // Decode NFT contract error codes: Error(Contract, #N)
  const contractMatch = err.match(/ERROR\(CONTRACT,\s*#(\d+)\)/);
  if (contractMatch) {
    const code = parseInt(contractMatch[1], 10);
    switch (code) {
      case 1: return "NOT AUTHORIZED: YOU DO NOT OWN THIS NFT.";
      case 2: return "NFT NOT FOUND: THIS TOKEN ID DOES NOT EXIST IN THE CONTRACT.";
      case 3: return "TOKEN ALREADY EXISTS.";
      case 4: return "NFT CONTRACT NOT INITIALIZED.";
      case 5: return "NFT CONTRACT ALREADY INITIALIZED. SKIPPING SETUP.";
    }
  }

  return "TRANSACTION FAILED: CHECK CONSOLE FOR DETAILS.";
}

// ── Phase labels ───────────────────────────────────────────────────────

const PHASE_LABELS: Record<MintPhase, string> = {
  idle: "READY",
  uploading: "UPLOADING TO IPFS...",
  initializing: "INITIALIZING CONTRACT...",
  minting: "SIGNING MINT TRANSACTION...",
  confirming: "AWAITING LEDGER CONFIRMATION...",
  success: "MINT SUCCESSFUL",
  error: "TRANSACTION FAILED",
};

// ── Hook ───────────────────────────────────────────────────────────────

export function useNftMint(): UseNftMintReturn {
  const { address, signTx } = useWalletStore();

  const [phase, setPhase] = useState<MintPhase>("idle");
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
  }, []);

  // ── Initialize the NFT contract (idempotent — safe to call repeatedly)
  const initializeContract = useCallback(
    async (): Promise<string> => {
      const caller = address;
      if (!caller) throw new Error("Wallet not connected");

      const server = getServer();
      const contract = getNftContract();
      if (!server || !contract)
        throw new Error("Soroban RPC or NFT contract not configured");

      const source = await server.getAccount(caller);

      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.networkPassphrase,
      })
        .addOperation(
          contract.call("initialize", new Address(caller).toScVal()),
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);

      if ("error" in sim) {
        const errMsg = String((sim as { error?: unknown }).error ?? "");
        // Error #5 = AlreadyInitialized — contract already initialized, fine to proceed
        if (errMsg.includes("Error(Contract, #5)") || errMsg.includes("AlreadyInitialized")) {
          console.log("NFT contract already initialized — skipping.");
          return "already-initialized";
        }
        throw new Error(`Initialize simulation failed: ${errMsg}`);
      }

      const assembled = assembleTransaction(tx, sim);
      const preparedTx = assembled.build();

      const signedXdr = await signTx(
        preparedTx.toXDR(),
        NETWORK.networkPassphrase,
      );

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
      );

      if (sendResult.status === "PENDING") {
        const txResult = await server.pollTransaction(sendResult.hash, {
          attempts: 30,
        });
        if (txResult.status !== "SUCCESS") {
          let detail = "no result";
          if ("resultXdr" in txResult && txResult.resultXdr) {
             detail = typeof txResult.resultXdr === "object" 
                ? JSON.stringify(txResult.resultXdr) 
                : String(txResult.resultXdr);
          }
          throw new Error(`Initialize failed: ${txResult.status} — ${detail}`);
        }
        return txResult.txHash;
      }

      throw new Error(`Initialize send returned: ${sendResult.status}`);
    },
    [address, signTx],
  );

  const mint = useCallback(
    async (
      title: string,
      description: string,
      file: File,
    ): Promise<MintResult> => {
      const caller = address;
      if (!caller) throw new Error("Wallet not connected");
      if (!NFT_CONTRACT_ADDRESS) throw new Error("NFT contract not configured");

      // ── Step 1: Upload asset to IPFS ──────────────────────────
      setPhase("uploading");
      setError(null);
      setResult(null);

      let uploadData: UploadResult;
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title);
        formData.append("description", description);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error || "IPFS upload failed");
        }

        uploadData = {
          imageUri: uploadJson.imageUri,
          imageGateway: uploadJson.imageGateway,
          metadataUri: uploadJson.metadataUri,
          metadataGateway: uploadJson.metadataGateway,
        };
      } catch (err: unknown) {
        setPhase("error");
        const msg =
          err instanceof Error ? err.message : "IPFS upload failed";
        setError(msg);
        throw err;
      }

      // ── Step 2: Ensure contract is initialized ─────────────────
      setPhase("initializing");
      try {
        await initializeContract();
      } catch (err: unknown) {
        setPhase("error");
        const msg = err instanceof Error ? err.message : "Contract init failed";
        setError(msg);
        throw err;
      }

      // ── Step 3: Build & submit Soroban mint transaction ────────
      setPhase("minting");

      const server = getServer();
      const contract = getNftContract();
      if (!server || !contract) {
        setPhase("error");
        const msg = "Soroban RPC or NFT contract not configured";
        setError(msg);
        throw new Error(msg);
      }

      try {
        const source = await server.getAccount(caller);

        const tx = new TransactionBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: NETWORK.networkPassphrase,
        })
          .addOperation(
            contract.call(
              "mint",
              new Address(caller).toScVal(),
              nativeToScVal(uploadData.metadataUri, { type: "string" }),
            ),
          )
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);

        if ("error" in sim) {
          const simErr = String((sim as { error?: unknown }).error ?? "");
          // ── PATCHED: Map raw Rust host errors to clean messages ──
          if (simErr.includes("Contract, #2")) {
            throw new Error("Transaction Rejected: You are not the current owner of this NFT or it is locked in escrow.");
          }
          if (simErr.includes("Contract, #1")) {
            throw new Error("Transaction Rejected: Unauthorized administrative action.");
          }
          throw new Error(`Simulation failed: ${simErr}`);
        }

        let expectedTokenId = "0";
        if (sim.result?.retval) {
          try {
            expectedTokenId = String(scValToNative(sim.result.retval));
          } catch {
            // Non-critical: we'll still have the txHash
          }
        }

        // ── PATCHED: Use prepareTransaction to inject Soroban resource footprints ──
        // This replaces the manual assembleTransaction + build pattern and ensures
        // restore_preamble / resource leeway are injected by the RPC server.
        const preparedTx = await server.prepareTransaction(tx);

        // ── Step 4: Sign via Freighter ──────────────────────────
        const signedXdr = await signTx(
          preparedTx.toXDR(),
          NETWORK.networkPassphrase,
        );

        // ── Step 5: Submit & poll for confirmation ──────────────
        setPhase("confirming");

        const sendResult = await server.sendTransaction(
          TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
        );

        if (sendResult.status !== "PENDING") {
          throw new Error(
            `Send returned unexpected status: ${sendResult.status}`,
          );
        }

        const txResult = await server.pollTransaction(sendResult.hash, {
          attempts: 30,
        });

        if (txResult.status !== "SUCCESS") {
          // FIX: Safely parse the object to prevent "[object Object]"
          let detail = "no result available";
          if ("resultXdr" in txResult && txResult.resultXdr) {
             detail = typeof txResult.resultXdr === "object" 
                ? JSON.stringify(txResult.resultXdr) 
                : String(txResult.resultXdr);
          }
          
          // Dump the full RPC response object to the console for deep debugging
          console.error("FULL RPC TX_RESULT DUMP:", JSON.stringify(txResult, null, 2));
          
          throw new Error(`Transaction failed: ${txResult.status} — ${detail}`);
        }

        const mintResult: MintResult = {
          tokenId: expectedTokenId,
          txHash: txResult.txHash,
          metadataUri: uploadData.metadataUri,
          imageGateway: uploadData.imageGateway,
        };

        // Persist the minted NFT to the local gallery store
        useNftStore.getState().addNft({
          tokenId: expectedTokenId,
          txHash: txResult.txHash,
          metadataUri: uploadData.metadataUri,
          metadataGateway: uploadData.metadataGateway,
          imageGateway: uploadData.imageGateway,
          title,
          description,
          mintedAt: Date.now(),
          owner: caller,
        });

        setPhase("success");
        setResult(mintResult);
        return mintResult;
      } catch (err: any) {
        setPhase("error");
        const message =
          err instanceof Error
            ? parseLedgerError(err.message)
            : "AN UNKNOWN ERROR OCCURRED.";
        setError(message);

        // ── PATCHED: Deep Axios / Horizon error logging ──
        if (err instanceof Error) {
          console.error("RAW NFT MINT ERROR MESSAGE:", err.message);
        }
        // Surface Axios-style network errors (e.g. tx_bad_seq from Horizon)
        if (err?.response?.data) {
          console.error("HORIZON RESPONSE DATA:", JSON.stringify(err.response.data, null, 2));
          if (err.response.data?.extras?.result_codes) {
            console.error("HORIZON RESULT CODES:", JSON.stringify(err.response.data.extras.result_codes, null, 2));
          }
        }
        if (typeof err === 'object' && err !== null) {
          console.error("DETAILED ERROR OBJECT:", JSON.stringify(err, null, 2));
        }

        throw err;
      }
    },
    [address, signTx],
  );

  const burnNft = useCallback(async (tokenId: string): Promise<string> => {
    const caller = address;
    if (!caller) throw new Error("Wallet not connected");

    const server = getServer();
    const contract = getNftContract();
    if (!server || !contract) throw new Error("Soroban RPC or NFT contract not configured");

    setPhase("confirming");
    setError(null);

    // ── Pre-flight: verify user actually owns the NFT before attempting burn ──
    try {
  const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
  const ownerTx = new TransactionBuilder(dummySource, { 
    fee: BASE_FEE, 
    networkPassphrase: NETWORK.networkPassphrase 
  })
    .addOperation(contract.call("owner_of", nativeToScVal(BigInt(tokenId), { type: "i128" })))
    .setTimeout(30)
    .build();

  const ownerSim = await server.simulateTransaction(ownerTx);
  
  if ("result" in ownerSim && ownerSim.result?.retval) {
    // ── FOOLPROOF ADDRESS PARSING ──
    // Do not rely on scValToNative for strict string equality checks on Addresses.
    // Use Address.fromScVal to guarantee a clean, standardized public key string.
    const ownerAddr = Address.fromScVal(ownerSim.result.retval).toString();
    
    // Normalize both strings to lowercase to prevent casing mismatches
    if (ownerAddr.toLowerCase() !== caller.toLowerCase()) {
      throw new Error(`NOT AUTHORIZED: YOU DO NOT OWN THIS NFT. Owner is ${ownerAddr}, you are ${caller}.`);
    }
  }
} catch (preErr: any) {
  if (preErr?.message?.includes("NOT AUTHORIZED")) throw preErr;
  // If owner_of fails entirely (e.g. token doesn't exist), fall through to burn for the real contract error
}

try {
  const source = await server.getAccount(caller);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "burn",
        new Address(caller).toScVal(),
        nativeToScVal(BigInt(tokenId), { type: "i128" }),
      ),
    )
    .setTimeout(30)
    .build();

      const sim = await server.simulateTransaction(tx);
      if ("error" in sim) {
        const simErr = String((sim as { error?: unknown }).error ?? "");
        // ── PATCHED: Map raw Rust host errors to clean messages ──
        if (simErr.includes("Contract, #2")) {
          throw new Error("Transaction Rejected: You are not the current owner of this NFT or it is locked in escrow.");
        }
        if (simErr.includes("Contract, #1")) {
          throw new Error("Transaction Rejected: Unauthorized administrative action.");
        }
        throw new Error(`Burn simulation failed: ${simErr}`);
      }

      // ── PATCHED: Use prepareTransaction for Soroban resource footprints ──
      const preparedTx = await server.prepareTransaction(tx);
      const signedXdr = await signTx(preparedTx.toXDR(), NETWORK.networkPassphrase);

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
      );

      if (sendResult.status !== "PENDING") {
        throw new Error(`Send returned unexpected status: ${sendResult.status}`);
      }

      const txResult = await server.pollTransaction(sendResult.hash, { attempts: 30 });
      if (txResult.status !== "SUCCESS") {
        let detail = "no result available";
        if ("resultXdr" in txResult && txResult.resultXdr) {
          detail = typeof txResult.resultXdr === "object"
            ? JSON.stringify(txResult.resultXdr)
            : String(txResult.resultXdr);
        }
        throw new Error(`Burn failed: ${txResult.status} — ${detail}`);
      }

      // Remove from local store
      useNftStore.getState().removeNft(tokenId);

      setPhase("success");
      return txResult.txHash;
    } catch (err: any) {
      setPhase("error");
      const message =
        err instanceof Error
          ? parseLedgerError(err.message)
          : "AN UNKNOWN ERROR OCCURRED.";
      setError(message);
      console.error("RAW BURN ERROR:", err.message);
      throw err;
    }
  }, [address, signTx]);

  // ── ADMIN BURN (forced burn for contract-locked NFTs) ───────────
  const adminBurnNft = useCallback(async (tokenId: string): Promise<string> => {
    const caller = address;
    if (!caller) throw new Error("Wallet not connected");

    const server = getServer();
    const contract = getNftContract();
    if (!server || !contract) throw new Error("Soroban RPC or NFT contract not configured");

    setPhase("confirming");
    setError(null);

    try {
      // Verify the NFT exists before calling admin_burn
      const dummySource = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
      const ownerTx = new TransactionBuilder(dummySource, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.networkPassphrase,
      })
        .addOperation(contract.call("owner_of", nativeToScVal(BigInt(tokenId), { type: "i128" })))
        .setTimeout(30)
        .build();

      const ownerSim = await server.simulateTransaction(ownerTx);

      // If the token doesn't exist at all, let the contract return the real error
      let tokenOwner = "unknown";
      if ("result" in ownerSim && ownerSim.result?.retval) {
        tokenOwner = Address.fromScVal(ownerSim.result.retval).toString();
      }

      // Build the admin_burn transaction
      const source = await server.getAccount(caller);
      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.networkPassphrase,
      })
        .addOperation(
          contract.call(
            "admin_burn",
            new Address(caller).toScVal(),
            nativeToScVal(BigInt(tokenId), { type: "i128" }),
          ),
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if ("error" in sim) {
        const simErr = String((sim as { error?: unknown }).error ?? "");
        // ── PATCHED: Map raw Rust host errors to clean messages ──
        if (simErr.includes("Contract, #2")) {
          throw new Error("Transaction Rejected: You are not the current owner of this NFT or it is locked in escrow.");
        }
        if (simErr.includes("Contract, #1")) {
          throw new Error("Transaction Rejected: Unauthorized administrative action.");
        }
        throw new Error(`Admin burn simulation failed: ${simErr}`);
      }

      // ── PATCHED: Use prepareTransaction for Soroban resource footprints ──
      const preparedTx = await server.prepareTransaction(tx);
      const signedXdr = await signTx(preparedTx.toXDR(), NETWORK.networkPassphrase);

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedXdr, NETWORK.networkPassphrase),
      );

      if (sendResult.status !== "PENDING") {
        throw new Error(`Send returned unexpected status: ${sendResult.status}`);
      }

      const txResult = await server.pollTransaction(sendResult.hash, { attempts: 30 });
      if (txResult.status !== "SUCCESS") {
        let detail = "no result available";
        if ("resultXdr" in txResult && txResult.resultXdr) {
          detail = typeof txResult.resultXdr === "object"
            ? JSON.stringify(txResult.resultXdr)
            : String(txResult.resultXdr);
        }
        throw new Error(`Admin burn failed: ${txResult.status} — ${detail}`);
      }

      // Remove from local store
      useNftStore.getState().removeNft(tokenId);

      setPhase("success");
      return txResult.txHash;
    } catch (err: any) {
      setPhase("error");
      const message =
        err instanceof Error
          ? parseLedgerError(err.message)
          : "AN UNKNOWN ERROR OCCURRED.";
      setError(message);
      console.error("RAW ADMIN BURN ERROR:", err.message);
      throw err;
    }
  }, [address, signTx]);

  return {
    phase,
    phaseLabel: PHASE_LABELS[phase],
    result,
    error,
    mint,
    burnNft,
    adminBurnNft,
    initializeContract,
    reset,
  };
}