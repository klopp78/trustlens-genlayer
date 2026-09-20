import assert from "node:assert/strict";

const walletAddress = "0x1111111111111111111111111111111111111111";
const caseId = "trc_9cfe7c9b23f8428f2d3a";
const verdictId = "tlv_725bf671258bf0427c5e";

class StudioFlowSimulator {
  constructor() {
    this.calls = [];
    this.cases = new Map();
    this.verdicts = new Map();
  }

  async writeContract({ functionName, args }) {
    this.calls.push({ kind: "write", functionName, args });
    if (functionName === "register_case") {
      const [subjectUrl, claim, primaryUrl, archiveUrl, contextUrl] = args;
      assert.match(subjectUrl, /GenLayer\/status/);
      assert.match(claim, /online trust/);
      assert.match(primaryUrl, /GenLayer\/status/);
      assert.match(archiveUrl, /social-trust-archive\.md$/);
      assert.match(contextUrl, /context-note\.md$/);
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
          risk_level: "low",
        },
      });
      record.state = "assessed";
      record.verdict_ids.push(verdictId);
      return "0xassesscase";
    }
    throw new Error(`Unexpected write ${functionName}`);
  }

  async waitForTransactionReceipt({ hash }) {
    this.calls.push({ kind: "receipt", hash });
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

function receiptString(receipt, pattern, label) {
  const value = Object.values(receipt).find(
    (candidate) => typeof candidate === "string" && pattern.test(candidate),
  );
  assert.ok(value, `Accepted ${label} receipt must contain its returned identifier`);
  return value;
}

async function runFullFlow(client) {
  const caseHash = await client.writeContract({
    functionName: "register_case",
    args: [
      "https://x.com/GenLayer/status/2100198421806125549",
      "This post argues that online trust now requires verifiable evidence because humans are a minority online.",
      "https://x.com/GenLayer/status/2100198421806125549",
      "https://github.com/klopp78/trustlens-genlayer/blob/main/examples/social-trust-archive.md",
      "https://github.com/klopp78/trustlens-genlayer/blob/main/examples/context-note.md",
    ],
  });
  const caseReceipt = await client.waitForTransactionReceipt({ hash: caseHash });
  const returnedCaseId = receiptString(caseReceipt, /^trc_[a-f0-9]{20}$/, "case");
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
  const verdictReceipt = await client.waitForTransactionReceipt({ hash: verdictHash });
  const returnedVerdictId = receiptString(verdictReceipt, /^tlv_[a-f0-9]{20}$/, "verdict");
  const verdict = JSON.parse(await client.readContract({
    functionName: "get_verdict",
    args: [returnedVerdictId],
  }));
  assert.equal(verdict.state, "finalized");
  assert.equal(verdict.consensus_result.decision, "trusted");
  assert.equal(verdict.consensus_result.provenance_verified, true);
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
    "read:get_case",
    "write:assess_case",
    "receipt:0xassesscase",
    "read:get_verdict",
  ],
);
assert.equal(outcome.returnedCaseId, caseId);
assert.equal(outcome.returnedVerdictId, verdictId);
console.log("TrustLens simulated full-flow check passed");
