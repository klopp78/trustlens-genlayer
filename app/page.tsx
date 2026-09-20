import { TRUST_LENS_CONTRACT_ADDRESS } from "@/lib/genlayer";

const repoUrl = "https://github.com/klopp78/trustlens-genlayer";
const studioUrl = `https://explorer-studio.genlayer.com/address/${TRUST_LENS_CONTRACT_ADDRESS}`;

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#161814]">
      <section className="border-b border-[#d9ded2] bg-[#fbfcf8]">
        <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <span className="pill">GenLayer Project</span>
          <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">
                TrustLens
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#596452]">
                A consensus lens for online trust. Register a suspicious
                account or post, bind independent evidence snapshots, and ask
                GenLayer validators to produce a durable social trust verdict.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a className="action-button primary" href="/case">Register case</a>
                <a className="action-button" href="/assess">Assess evidence</a>
                <a className="action-button" href="/records">Inspect records</a>
              </div>
            </div>
            <div className="escrow-board">
              <div>
                <span>Evidence provenance</span>
                <strong>Subject, primary evidence, archive, and context URLs are fetched and hashed</strong>
              </div>
              <div>
                <span>Validator comparison</span>
                <strong>Every consequential field is recomputed before a verdict is accepted</strong>
              </div>
              <div>
                <span>Persistent receipts</span>
                <strong>Each trc_* case and tlv_* verdict stays readable on-chain</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-8 md:grid-cols-3 lg:px-8">
        <article className="tool-panel">
          <span className="field-label">01 Register</span>
          <h2 className="mt-2 text-2xl font-semibold">Source-bound case</h2>
          <p className="mt-3 leading-7 text-[#596452]">
            The contract stores the claim, subject URL, and SHA-256 commitments
            for every fetched evidence snapshot before assessment begins.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#25614b]" href="/case">Open case flow</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">02 Assess</span>
          <h2 className="mt-2 text-2xl font-semibold">Consensus social verdict</h2>
          <p className="mt-3 leading-7 text-[#596452]">
            Validators compare the subject, archive, primary evidence, and
            context source before returning trusted, risky, or needs review.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#25614b]" href="/assess">Open assessment</a>
        </article>
        <article className="tool-panel">
          <span className="field-label">03 Verify</span>
          <h2 className="mt-2 text-2xl font-semibold">Readable audit trail</h2>
          <p className="mt-3 leading-7 text-[#596452]">
            Anyone can read a case or verdict ID and inspect exactly which
            evidence commitments informed the consensus receipt.
          </p>
          <a className="mt-5 inline-block text-sm font-semibold text-[#25614b]" href="/records">Open records</a>
        </article>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-5 pb-10 text-sm text-[#596452] lg:px-8">
        <a href={repoUrl} rel="noreferrer" target="_blank">Source repository</a>
        <a href={studioUrl} rel="noreferrer" target="_blank">Studio contract</a>
        <code>{TRUST_LENS_CONTRACT_ADDRESS}</code>
      </footer>
    </main>
  );
}
