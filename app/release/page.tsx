import Link from "next/link";

export default function LegacyReleasePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-[#161814]">
      <Link className="pill" href="/">TrustLens</Link>
      <h1 className="mt-7 text-4xl font-semibold">TrustLens replaced this flow</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[#596452]">
        This project now assesses social trust evidence and produces tlv_* verdicts.
      </p>
      <Link className="action-button primary mt-6 inline-flex" href="/assess">Assess evidence</Link>
    </main>
  );
}
