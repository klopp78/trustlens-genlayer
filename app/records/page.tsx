"use client";

import { useState } from "react";
import Link from "next/link";
import { readCase, readVerdict, TRUST_LENS_CONTRACT_ADDRESS, type WalletAddress } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function RecordsPage() {
  const [caseId, setCaseId] = useState("");
  const [verdictId, setVerdictId] = useState("");
  const [address, setAddress] = useState(TRUST_LENS_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Read a TrustLens case or verdict from the deployed contract.");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("No browser wallet detected.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as WalletAddress[];
    if (!accounts[0]) throw new Error("No wallet account returned.");
    setWallet(accounts[0]);
    return accounts[0];
  }

  async function read(kind: "case" | "verdict") {
    try {
      setBusy(true);
      const options = { walletAddress: wallet ?? undefined, contractAddress: address as `0x${string}` };
      const value = kind === "case" ? await readCase(caseId, options) : await readVerdict(verdictId, options);
      setRecord(typeof value === "string" ? value : JSON.stringify(value, null, 2));
      setMessage(`${kind} record loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#161814]">
      <Link className="pill" href="/">TrustLens</Link>
      <h1 className="mt-7 text-4xl font-semibold">Inspect records</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#596452]">
        Read exact on-chain case and verdict records, including source
        manifests, snapshot commitments, and consensus result fields.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="case" label="Case ID" value={caseId} setValue={setCaseId} />
        <Field id="verdict" label="Verdict ID" value={verdictId} setValue={setVerdictId} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button" disabled={busy || !caseId} onClick={() => read("case")}>Read case</button>
          <button className="action-button primary" disabled={busy || !verdictId} onClick={() => read("verdict")}>Read verdict</button>
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
