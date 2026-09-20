"use client";

import { useState } from "react";
import Link from "next/link";
import { assessCase, TRUST_LENS_CONTRACT_ADDRESS, type WalletAddress } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function AssessPage() {
  const [caseId, setCaseId] = useState("trc_");
  const [address, setAddress] = useState(TRUST_LENS_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Paste a registered trc_* case ID to request validator assessment.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    return accounts[0];
  }

  async function submit() {
    try {
      setBusy(true);
      setRecord("");
      setMessage("Waiting for validators to recompute evidence commitments and return a social trust verdict...");
      const account = wallet ?? (await connectWallet());
      const result = await assessCase({
        walletAddress: account,
        caseId,
        contractAddress: address as `0x${string}`,
      });
      setRecord(typeof result.verdict === "string" ? result.verdict : JSON.stringify(result.verdict, null, 2));
      setMessage(`Verdict accepted: ${result.verdictId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#161814]">
      <Link className="pill" href="/">TrustLens</Link>
      <h1 className="mt-7 text-4xl font-semibold">Assess evidence</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#596452]">
        Ask GenLayer validators to fetch the bound URLs again, compare every
        commitment, and finalize a tlv_* trust verdict.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="case" label="Case ID" value={caseId} setValue={setCaseId} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button primary" disabled={busy} onClick={submit}>{busy ? "Awaiting consensus" : "Assess case"}</button>
        </div>
        <p className="text-sm text-[#596452]">{message}</p>
      </section>
      {record ? <pre className="result-card mt-6 overflow-x-auto text-sm">{record}</pre> : null}
    </main>
  );
}

function Field({ id, label, value, setValue }: { id: string; label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input className="text-input" id={id} value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}
