import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const REPORTER = "0x1111111111111111111111111111111111111111";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function source(url, type, index) {
  const canonicalUrl = url.replace(/[?#].*$/, "");
  return {
    source_index: index,
    source_type: type,
    host: new URL(canonicalUrl).host.toLowerCase(),
    canonical_url: canonicalUrl,
    url_hash: sha256(canonicalUrl),
  };
}

function renderedText(url) {
  const path = url.split("/").pop();
  if (path === "blocked-evidence.md") return "";
  const fixtures = {
    "subject-profile.md": "Subject: official account. Trust context matches GenLayer public narrative.",
    "primary-evidence.md": "Primary evidence: the subject post discusses online trust and machine-generated social activity, and it gives validators enough readable source material to compare with the submitted claim.",
    "social-trust-archive.md": "Archive: corroborates the social trust post and preserves observation context with enough stable text for validators to bind into the receipt.",
    "README.md": "GenLayer project boilerplate documentation from an external organization. This independently corroborates the source bundle and gives validators a non-reporter-controlled reference point for the trust assessment.",
    "context-note.md": "Context: validators should fetch sources and return a durable verdict rather than a local keyword score.",
    "thin-context.md": "Context unavailable.",
  };
  return fixtures[path] ?? `Source page: ${url}`;
}

function snapshots(sources) {
  return sources.map((item) => {
    const text = renderedText(item.canonical_url);
    const fetchError = item.canonical_url.endsWith("/blocked-evidence.md");
    return {
      source_index: item.source_index,
      source_type: item.source_type,
      canonical_url: item.canonical_url,
      host: item.host,
      url_hash: item.url_hash,
      snapshot_hash: sha256(text),
      snapshot_chars: text.length,
      fetch_error: fetchError,
      text,
    };
  });
}

function commitments(sources, sourceSnapshots) {
  return sources.map((item, index) => ({
    source_index: item.source_index,
    source_type: item.source_type,
    host: item.host,
    canonical_url: item.canonical_url,
    url_hash: item.url_hash,
    snapshot_hash: sourceSnapshots[index].snapshot_hash,
    snapshot_chars: sourceSnapshots[index].snapshot_chars,
    fetch_error: sourceSnapshots[index].fetch_error,
  }));
}

function authorityReport(sources, sourceSnapshots) {
  const subjectHost = sources[0].host;
  const hosts = [...new Set(sources.map((item) => item.host))];
  const readableExternalHosts = [];
  const unreadableSources = [];
  sources.forEach((item, index) => {
    const snapshot = sourceSnapshots[index];
    const readable = !snapshot.fetch_error && snapshot.snapshot_chars >= 80;
    const evidenceSource = item.source_type === "primary_evidence" || item.source_type === "archive" || item.source_type === "context";
    if (evidenceSource && !readable) unreadableSources.push(item.source_type);
    if (evidenceSource && item.host !== subjectHost && readable) {
      if (!readableExternalHosts.includes(item.host)) readableExternalHosts.push(item.host);
    }
  });
  return {
    subject_host: subjectHost,
    distinct_hosts: hosts.length,
    external_corroboration: readableExternalHosts.length >= 1,
    readable_external_hosts: readableExternalHosts,
    all_sources_readable: unreadableSources.length === 0,
    unreadable_sources: unreadableSources,
  };
}

class TrustLensModel {
  constructor() {
    this.cases = new Map();
    this.verdicts = new Map();
    this.caseCount = 0;
  }

  registerCase(contextUrl = "https://github.com/genlayerlabs/genlayer-project-boilerplate/blob/main/README.md") {
    const claim = "This GenLayer social trust signal should be trusted only when validator-fetched evidence is readable and independently corroborated.";
    const sources = [
      source("https://github.com/klopp78/trustlens-genlayer/blob/main/examples/subject-profile.md", "subject", 1),
      source("https://raw.githubusercontent.com/klopp78/trustlens-genlayer/main/examples/primary-evidence.md", "primary_evidence", 2),
      source("https://github.com/klopp78/trustlens-genlayer/blob/main/examples/social-trust-archive.md", "archive", 3),
      source(contextUrl, "context", 4),
    ];
    const sourceSnapshots = snapshots(sources);
    const snapshotCommitments = commitments(sources, sourceSnapshots);
    const subjectSnapshot = sourceSnapshots.find((item) => item.source_type === "subject");
    const baseline = {
      claim,
      reporter: REPORTER,
      subject_url: sources[0].canonical_url,
      subject_snapshot_hash: subjectSnapshot.snapshot_hash,
      snapshot_commitments: snapshotCommitments,
    };
    const baselineRecord = {
      reporter: REPORTER,
      subject_excerpt: subjectSnapshot.text.slice(0, 1800),
      snapshot_commitments: snapshotCommitments,
      source_bundle_hash: sha256(canonicalJson(sources)),
      baseline_hash: sha256(canonicalJson(baseline)),
    };
    const caseId = `trc_${sha256(`${REPORTER}|${claim.toLowerCase()}|${baselineRecord.baseline_hash}`).slice(0, 20)}`;
    if (this.cases.has(caseId)) throw new Error("case_already_registered");
    this.caseCount += 1;
    this.cases.set(caseId, {
      schema_version: "trustlens.case.v1",
      case_id: caseId,
      reporter: REPORTER,
      claim,
      subject_url: sources[0].canonical_url,
      source_manifest: sources,
      baseline: baselineRecord,
      verdict_ids: [],
      state: "registered",
    });
    return caseId;
  }

  assessCase(caseId) {
    const record = this.cases.get(caseId);
    if (!record) throw new Error("case_not_found");
    const sourceSnapshots = snapshots(record.source_manifest);
    const snapshotCommitments = commitments(record.source_manifest, sourceSnapshots);
    const authority = authorityReport(record.source_manifest, sourceSnapshots);
    const evidenceBundleHash = sha256(canonicalJson(snapshotCommitments));
    const assessmentContext = {
      case_id: caseId,
      claim: record.claim,
      baseline_hash: record.baseline.baseline_hash,
      baseline_commitments: record.baseline.snapshot_commitments,
      current_snapshot_commitments: snapshotCommitments,
      authority_report: authority,
    };
    const assessmentContextHash = sha256(canonicalJson(assessmentContext));
    const authorityReportHash = sha256(canonicalJson(authority));
    const evidenceDiverse = authority.distinct_hosts >= 2 && authority.external_corroboration;
    const sourceAuthorityVerified = evidenceDiverse && authority.all_sources_readable;
    const provenanceVerified = sourceAuthorityVerified;
    const decision = sourceAuthorityVerified ? "trusted" : "needs_review";
    const verdictId = `tlv_${sha256(`${caseId}|${decision}|${evidenceBundleHash}`).slice(0, 20)}`;
    if (this.verdicts.has(verdictId)) throw new Error("verdict_already_recorded");
    const verdict = {
      schema_version: "trustlens.verdict.v1",
      verdict_id: verdictId,
      case_id: caseId,
      baseline_hash: record.baseline.baseline_hash,
      evidence_bundle_hash: evidenceBundleHash,
      assessment_context_hash: assessmentContextHash,
      snapshot_commitments: snapshotCommitments,
      consensus_result: {
        decision,
        confidence: decision === "trusted" ? 88 : 54,
        subject_match: true,
        evidence_diverse: evidenceDiverse,
        provenance_verified: provenanceVerified,
        source_authority_verified: sourceAuthorityVerified,
        risk_level: decision === "trusted" ? "low" : "medium",
        authority_report: authority,
        authority_report_hash: authorityReportHash,
      },
      state: "finalized",
    };
    record.state = "assessed";
    record.verdict_ids.push(verdictId);
    this.verdicts.set(verdictId, verdict);
    return verdictId;
  }
}

function expectError(fn, message) {
  assert.throws(fn, (error) => String(error.message).includes(message));
}

const model = new TrustLensModel();
const caseId = model.registerCase();
const caseRecord = model.cases.get(caseId);
assert.equal(caseRecord.state, "registered");
assert.equal(caseRecord.baseline.snapshot_commitments.length, 4);
assert.equal(caseRecord.baseline.baseline_hash.length, 64);
expectError(() => model.registerCase(), "case_already_registered");

const verdictId = model.assessCase(caseId);
const verdict = model.verdicts.get(verdictId);
assert.equal(verdict.state, "finalized");
assert.equal(verdict.consensus_result.decision, "trusted");
assert.equal(verdict.consensus_result.evidence_diverse, true);
assert.equal(verdict.consensus_result.source_authority_verified, true);
assert.equal(verdict.evidence_bundle_hash.length, 64);
assert.equal(verdict.assessment_context_hash.length, 64);
assert.equal(verdict.consensus_result.authority_report_hash.length, 64);
assert.deepEqual(model.cases.get(caseId).verdict_ids, [verdictId]);
expectError(() => model.assessCase(caseId), "verdict_already_recorded");
expectError(() => model.assessCase("trc_missing"), "case_not_found");

const hostileModel = new TrustLensModel();
const hostileCaseId = hostileModel.registerCase("https://github.com/klopp78/trustlens-genlayer/blob/main/examples/blocked-evidence.md");
const hostileVerdictId = hostileModel.assessCase(hostileCaseId);
const hostileVerdict = hostileModel.verdicts.get(hostileVerdictId);
assert.equal(hostileVerdict.consensus_result.decision, "needs_review");
assert.equal(hostileVerdict.consensus_result.provenance_verified, false);
assert.equal(hostileVerdict.consensus_result.source_authority_verified, false);
assert.deepEqual(hostileVerdict.consensus_result.authority_report.unreadable_sources, ["context"]);

console.log("TrustLens lifecycle tests passed");
