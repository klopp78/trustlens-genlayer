import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contractPath = resolve("contracts/trust_lens.py");
const source = readFileSync(contractPath, "utf8");
const expectedRuntime =
  "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

assert(source.includes(expectedRuntime), `missing pinned runtime dependency: ${expectedRuntime}`);
assert(/class\s+TrustLens\s*\(\s*gl\.Contract\s*\)\s*:/.test(source), "TrustLens must inherit gl.Contract");
assert(!/gl\.get_webpage|gl\.exec_prompt|gl\.json_loads|gl\.json_dumps|gl\.msg/.test(source), "unsupported legacy gl APIs remain");

for (const method of [
  "register_case",
  "assess_case",
  "get_case",
  "get_verdict",
  "list_case_ids",
  "list_verdict_ids",
]) {
  assert(new RegExp(`def\\s+${method}\\s*\\(`).test(source), `missing method: ${method}`);
}

for (const method of ["register_case", "assess_case"]) {
  assert(new RegExp(`@gl\\.public\\.write\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be public.write`);
}

for (const method of ["get_case", "get_verdict", "list_case_ids", "list_verdict_ids"]) {
  assert(new RegExp(`@gl\\.public\\.view\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be public.view`);
}

assert(/gl\.vm\.run_nondet_unsafe/.test(source), "missing GenLayer consensus gate");
assert(/gl\.nondet\.web\.render/.test(source), "missing source snapshot rendering");
assert(/gl\.nondet\.exec_prompt/.test(source), "missing validator prompt assessment");
assert(/hashlib\.sha256/.test(source), "must use collision-resistant SHA-256");
assert(/snapshot_commitments/.test(source), "must persist snapshot commitments");
assert(/evidence_bundle_hash/.test(source), "must persist evidence bundle hash");
assert(/assessment_context_hash/.test(source), "must persist assessment context hash");
assert(/source_manifest/.test(source), "must persist source manifest");
assert(/subject_match/.test(source) && /evidence_diverse/.test(source), "verdict must preserve consequential assessment fields");
assert(/provenance_verified/.test(source), "verdict must verify provenance");
assert(/source_authority_verified/.test(source), "verdict must include source authority gate");
assert(/fetch_error/.test(source), "verdict must record unreachable evidence");
assert(/external_corroboration/.test(source), "verdict must require external corroboration");
assert(/proposed\.snapshot_commitments_json == independent\.snapshot_commitments_json/.test(source), "validators must compare snapshot commitments");
assert(/proposed\.authority_report_hash == independent\.authority_report_hash/.test(source), "validators must compare authority report hash");
assert(/len\(data\["snapshot_commitments"\]\) != 4/.test(source), "verdict parser must require four source commitments");
assert(/trusted_without_source_authority/.test(source), "trusted verdicts must fail without source authority");
assert(!/32-bit|crc32|adler32/.test(source), "weak hash wording or implementation remains");

const caseId = `trc_${sha256("reporter|claim|baseline").slice(0, 20)}`;
const verdictId = `tlv_${sha256("case|trusted|evidence").slice(0, 20)}`;
assert(caseId.length === 24, "case id format check failed");
assert(verdictId.length === 24, "verdict id format check failed");

console.log("TrustLens contract check passed");
