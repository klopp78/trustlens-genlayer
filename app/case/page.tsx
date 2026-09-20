"use client";

import { useState } from "react";
import Link from "next/link";
import { registerCase, TRUST_LENS_CONTRACT_ADDRESS, type WalletAddress } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

export default function CasePage() {
  const [subjectUrl, setSubjectUrl] = useState("https://x.com/GenLayer/status/2100198421806125549");
  const [claim, setClaim] = useState("This post argues that online trust now requires verifiable evidence because humans are a minority online.");
  const [primaryEvidenceUrl, setPrimaryEvidenceUrl] = useState("https://x.com/GenLayer/status/2100198421806125549");
  const [archiveUrl, setArchiveUrl] = useState("https://github.com/klopp78/trustlens-genlayer/blob/main/examples/social-trust-archive.md");
  const [contextUrl, setContextUrl] = useState("https://github.com/klopp78/trustlens-genlayer/blob/main/examples/context-note.md");
  const [address, setAddress] = useState(TRUST_LENS_CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState<WalletAddress | null>(null);
  const [message, setMessage] = useState("Connect a browser wallet to register a source-bound trust case.");
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
      setMessage("Waiting for GenLayer validators to bind subject and evidence snapshots...");
      const account = wallet ?? (await connectWallet());
      const result = await registerCase({
        walletAddress: account,
        subjectUrl,
        claim,
        primaryEvidenceUrl,
        archiveUrl,
        contextUrl,
        contractAddress: address as `0x${string}`,
      });
      setRecord(typeof result.caseRecord === "string" ? result.caseRecord : JSON.stringify(result.caseRecord, null, 2));
      setMessage(`Trust case accepted: ${result.caseId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#161814]">
      <Link className="pill" href="/">TrustLens</Link>
      <h1 className="mt-7 text-4xl font-semibold">Register trust case</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#596452]">
        Create a trc_* record that binds the subject, claim, evidence, archive,
        and context snapshots before any verdict is generated.
      </p>
      <section className="tool-panel mt-8 grid gap-4">
        <Field id="subject" label="Subject URL" value={subjectUrl} setValue={setSubjectUrl} />
        <TextArea id="claim" label="Claim to assess" value={claim} setValue={setClaim} />
        <Field id="primary" label="Primary evidence URL" value={primaryEvidenceUrl} setValue={setPrimaryEvidenceUrl} />
        <Field id="archive" label="Archive or source snapshot URL" value={archiveUrl} setValue={setArchiveUrl} />
        <Field id="context" label="Independent context URL" value={contextUrl} setValue={setContextUrl} />
        <Field id="address" label="Studio contract address" value={address} setValue={setAddress} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" onClick={() => connectWallet().then(() => setMessage("Wallet connected.")).catch((error) => setMessage(error.message))}>Connect wallet</button>
          <button className="action-button primary" disabled={busy} onClick={submit}>{busy ? "Awaiting consensus" : "Register case"}</button>
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

function TextArea({ id, label, value, setValue }: { id: string; label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <textarea className="text-input min-h-28" id={id} value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}
