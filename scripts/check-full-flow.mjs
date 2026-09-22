import assert from "node:assert/strict";

const walletAddress = "0x1111111111111111111111111111111111111111";
const caseId = "trc_9cfe7c9b23f8428f2d3a";
const verdictId = "tlv_725bf671258bf0427c5e";

class StudioFlowSimulator {
  constructor() {
    this.calls = [];
    this.cases = new Map();
    this.verdicts = new Map();
    this.receiptAttempts = new Map();
  }

  async writeContract({ functionName, args }) {
    this.calls.push({ kind: "write", functionName, args });
    if (functionName === "register_case") {
      const [subjectUrl, claim, primaryUrl, archiveUrl, contextUrl] = args;
      assert.match(subjectUrl, /subject-profile\.md$/);
      assert.match(claim, /validator-fetched evidence/);
      assert.match(primaryUrl, /primary-evidence\.md$/);
      assert.match(archiveUrl, /social-trust-archive\.md$/);
      assert.match(contextUrl, /genlayer-project-boilerplate\/blob\/main\/README\.md$/);
      this.cases.set(caseId, {
        case_id: caseId,
        reporter: walletAddress.toLowerCase(),
        claim,
        subject_url: subjectUrl,
        baseline: {
          baseline_hash: "a".repeat(64),
          snapshot_commitments: [{ source_type: "subject" }, { source_type: "primary_evidence" }, { source_type: "archive" }, { source_type: "context" }],
        },
        verdict_ids: [],
        state: "registered",
      });
      return "0xregistercase";
    }
    if (functionName === "assess_case") {
      const [submittedCaseId] = args;
      assert.equal(submittedCaseId, caseId);
      const record = this.cases.get(caseId);
      assert.ok(record, "case must exist before assessment");
      this.verdicts.set(verdictId, {
        verdict_id: verdictId,
        case_id: caseId,
        state: "finalized",
        evidence_bundle_hash: "b".repeat(64),
        assessment_context_hash: "c".repeat(64),
        snapshot_commitments: record.baseline.snapshot_commitments,
        consensus_result: {
          decision: "trusted",
          confidence: 88,
          subject_match: true,
          evidence_diverse: true,
          provenance_verified: true,
          source_authority_verified: true,
          risk_level: "low",
          authority_report_hash: "d".repeat(64),
        },
      });
      record.state = "assessed";
      record.verdict_ids.push(verdictId);
      return "0xassesscase";
    }
    throw new Error(`Unexpected write ${functionName}`);
  }

  async waitForTransactionReceipt({ hash, status }) {
    this.calls.push({ kind: "receipt", hash, status });
    const key = `${hash}:${status}`;
    const attempts = (this.receiptAttempts.get(key) ?? 0) + 1;
    this.receiptAttempts.set(key, attempts);
    if (status === "FINALIZED") throw new Error("consensus rotation still finalizing");
    if (hash === "0xregistercase" && attempts < 3) throw new Error("leader rotation in progress");
    if (hash === "0xregistercase") return { txExecutionResult: caseId };
    if (hash === "0xassesscase") return { txExecutionResult: verdictId };
    throw new Error(`Unknown transaction ${hash}`);
  }

  async readContract({ functionName, args }) {
    this.calls.push({ kind: "read", functionName, args });
    if (functionName === "get_case") return JSON.stringify(this.cases.get(args[0]) ?? {});
    if (functionName === "get_verdict") return JSON.stringify(this.verdicts.get(args[0]) ?? {});
    throw new Error(`Unexpected read ${functionName}`);
  }
}

function directReceiptReturn(receipt) {
  for (const key of ["txExecutionResult", "executionResult", "returnValue", "result"]) {
    const value = receipt[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      if (typeof value.value === "string") return value.value;
      if (typeof value.returnValue === "string") return value.returnValue;
    }
  }
  return null;
}

function returnedIdFromReceipt(receipt, prefix, label) {
  const value = directReceiptReturn(receipt);
  assert.ok(
    typeof value === "string" && value.startsWith(prefix) && value.length === 24,
    `Accepted ${label} receipt must expose a direct ${prefix} return field`,
  );
  return value;
}

async function waitForConsensusReceipt(client, hash) {
  try {
    return await client.waitForTransactionReceipt({ hash, status: "FINALIZED" });
  } catch {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await client.waitForTransactionReceipt({ hash, status: "ACCEPTED" });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

async function runFullFlow(client) {
  const caseHash = await client.writeContract({
    functionName: "register_case",
    args: [
      "https://github.com/klopp78/trustlens-genlayer/blob/main/examples/subject-profile.md",
      "This GenLayer social trust signal should be trusted only when validator-fetched evidence is readable and independently corroborated.",
      "https://raw.githubusercontent.com/klopp78/trustlens-genlayer/main/examples/primary-evidence.md",
      "https://github.com/klopp78/trustlens-genlayer/blob/main/examples/social-trust-archive.md",
      "https://github.com/genlayerlabs/genlayer-project-boilerplate/blob/main/README.md",
    ],
  });
  const caseReceipt = await waitForConsensusReceipt(client, caseHash);
  const returnedCaseId = returnedIdFromReceipt(caseReceipt, "trc_", "case");
  const caseRecord = JSON.parse(await client.readContract({
    functionName: "get_case",
    args: [returnedCaseId],
  }));
  assert.equal(caseRecord.state, "registered");
  assert.equal(caseRecord.baseline.snapshot_commitments.length, 4);

  const verdictHash = await client.writeContract({
    functionName: "assess_case",
    args: [returnedCaseId],
  });
  const verdictReceipt = await waitForConsensusReceipt(client, verdictHash);
  const returnedVerdictId = returnedIdFromReceipt(verdictReceipt, "tlv_", "verdict");
  const verdict = JSON.parse(await client.readContract({
    functionName: "get_verdict",
    args: [returnedVerdictId],
  }));
  assert.equal(verdict.state, "finalized");
  assert.equal(verdict.consensus_result.decision, "trusted");
  assert.equal(verdict.consensus_result.provenance_verified, true);
  assert.equal(verdict.consensus_result.source_authority_verified, true);
  assert.equal(verdict.evidence_bundle_hash.length, 64);
  return { returnedCaseId, returnedVerdictId };
}

const simulator = new StudioFlowSimulator();
const outcome = await runFullFlow(simulator);
assert.deepEqual(
  simulator.calls.map((call) => `${call.kind}:${call.functionName ?? call.hash}`),
  [
    "write:register_case",
    "receipt:0xregistercase",
    "receipt:0xregistercase",
    "receipt:0xregistercase",
    "receipt:0xregistercase",
    "read:get_case",
    "write:assess_case",
    "receipt:0xassesscase",
    "receipt:0xassesscase",
    "read:get_verdict",
  ],
);
assert.equal(outcome.returnedCaseId, caseId);
assert.equal(outcome.returnedVerdictId, verdictId);
console.log("TrustLens simulated full-flow check passed");
