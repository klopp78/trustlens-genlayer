# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import hashlib
import json
import typing


class TrustVerdict(typing.NamedTuple):
    decision: str
    confidence: u8
    subject_match: bool
    evidence_diverse: bool
    provenance_verified: bool
    source_authority_verified: bool
    risk_level: str
    evidence_bundle_hash: str
    assessment_context_hash: str
    snapshot_commitments_json: str
    authority_report_hash: str
    summary: str


class TrustLens(gl.Contract):
    """Consensus social trust registry for online accounts and posts."""

    case_count: u64
    latest_case_id: str
    latest_verdict_id: str
    case_ids: DynArray[str]
    verdict_ids: DynArray[str]
    cases: TreeMap[str, str]
    verdicts: TreeMap[str, str]

    def __init__(self):
        self.case_count = u64(0)
        self.latest_case_id = ""
        self.latest_verdict_id = ""

    @gl.public.view
    def get_case_count(self) -> u64:
        return self.case_count

    @gl.public.view
    def get_latest_case_id(self) -> str:
        return self.latest_case_id

    @gl.public.view
    def get_latest_verdict_id(self) -> str:
        return self.latest_verdict_id

    @gl.public.view
    def get_case(self, case_id: str) -> str:
        return self.cases.get(case_id, "")

    @gl.public.view
    def get_verdict(self, verdict_id: str) -> str:
        return self.verdicts.get(verdict_id, "")

    @gl.public.view
    def list_case_ids(self) -> str:
        return json.dumps([case_id for case_id in self.case_ids], separators=(",", ":"))

    @gl.public.view
    def list_verdict_ids(self) -> str:
        return json.dumps([verdict_id for verdict_id in self.verdict_ids], separators=(",", ":"))

    @gl.public.write
    def register_case(
        self,
        subject_url: str,
        claim: str,
        primary_evidence_url: str,
        archive_url: str,
        context_url: str,
    ) -> str:
        normalized_claim = _clean_text(claim, 320, "claim_required")
        reporter = str(gl.message.sender_address).lower()
        sources = _case_sources(subject_url, primary_evidence_url, archive_url, context_url)

        def leader_fn():
            return _commit_case_baseline(normalized_claim, reporter, sources)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                proposed = json.loads(leader_result.calldata)
                independent = json.loads(_commit_case_baseline(normalized_claim, reporter, sources))
            except Exception:
                return False
            return (
                proposed.get("baseline_hash") == independent.get("baseline_hash")
                and proposed.get("snapshot_commitments") == independent.get("snapshot_commitments")
                and proposed.get("source_bundle_hash") == independent.get("source_bundle_hash")
                and proposed.get("reporter") == reporter
            )

        baseline = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        case_id = _case_id(reporter, normalized_claim, baseline["baseline_hash"])
        if len(self.cases.get(case_id, "")) > 0:
            raise Exception("case_already_registered")

        self.case_count = u64(int(self.case_count) + 1)
        record = {
            "schema_version": "trustlens.case.v1",
            "case_id": case_id,
            "reporter": reporter,
            "claim": normalized_claim,
            "subject_url": sources[0]["canonical_url"],
            "source_manifest": sources,
            "baseline": baseline,
            "verdict_ids": [],
            "state": "registered",
            "created_sequence": int(self.case_count),
        }
        self.cases[case_id] = _canonical_json(record)
        self.case_ids.append(case_id)
        self.latest_case_id = case_id
        return case_id

    @gl.public.write
    def assess_case(self, case_id: str) -> str:
        case_record = _load_json(self.cases.get(case_id, ""), "case_not_found")
        if case_record["state"] not in ("registered", "assessed"):
            raise Exception("case_not_assessable")

        def leader_fn():
            return _assess_social_trust(case_record)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                proposed = _parse_verdict(leader_result.calldata)
                independent = _parse_verdict(_assess_social_trust(case_record))
            except Exception:
                return False
            return (
                proposed.decision == independent.decision
                and proposed.subject_match == independent.subject_match
                and proposed.evidence_diverse == independent.evidence_diverse
                and proposed.provenance_verified == independent.provenance_verified
                and proposed.source_authority_verified == independent.source_authority_verified
                and proposed.risk_level == independent.risk_level
                and proposed.evidence_bundle_hash == independent.evidence_bundle_hash
                and proposed.assessment_context_hash == independent.assessment_context_hash
                and proposed.authority_report_hash == independent.authority_report_hash
                and proposed.snapshot_commitments_json == independent.snapshot_commitments_json
                and abs(int(proposed.confidence) - int(independent.confidence)) <= 15
            )

        verdict = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        verdict_id = _verdict_id(case_id, verdict["decision"], verdict["evidence_bundle_hash"])
        if len(self.verdicts.get(verdict_id, "")) > 0:
            raise Exception("verdict_already_recorded")

        verdict_record = {
            "schema_version": "trustlens.verdict.v1",
            "verdict_id": verdict_id,
            "case_id": case_id,
            "assessor": str(gl.message.sender_address).lower(),
            "claim": case_record["claim"],
            "subject_url": case_record["subject_url"],
            "baseline_hash": case_record["baseline"]["baseline_hash"],
            "evidence_bundle_hash": verdict["evidence_bundle_hash"],
            "assessment_context_hash": verdict["assessment_context_hash"],
            "snapshot_commitments": verdict["snapshot_commitments"],
            "consensus_result": verdict,
            "state": "finalized",
        }
        case_record["state"] = "assessed"
        case_record["verdict_ids"].append(verdict_id)
        self.verdicts[verdict_id] = _canonical_json(verdict_record)
        self.cases[case_id] = _canonical_json(case_record)
        self.verdict_ids.append(verdict_id)
        self.latest_verdict_id = verdict_id
        return verdict_id


def _commit_case_baseline(claim: str, reporter: str, sources: typing.Sequence[dict]) -> str:
    snapshots = _render_sources(sources)
    snapshot_commitments = _snapshot_commitments(sources, snapshots)
    subject_snapshot = next(item for item in snapshots if item["source_type"] == "subject")
    baseline = {
        "claim": claim,
        "reporter": reporter,
        "subject_url": sources[0]["canonical_url"],
        "subject_snapshot_hash": subject_snapshot["snapshot_hash"],
        "snapshot_commitments": snapshot_commitments,
    }
    return _canonical_json(
        {
            "reporter": reporter,
            "subject_excerpt": subject_snapshot["text"][:1800],
            "snapshot_commitments": snapshot_commitments,
            "source_bundle_hash": _sha256(_canonical_json(sources)),
            "baseline_hash": _sha256(_canonical_json(baseline)),
        }
    )


def _assess_social_trust(case_record: dict) -> str:
    sources = case_record["source_manifest"]
    snapshots = _render_sources(sources)
    snapshot_commitments = _snapshot_commitments(sources, snapshots)
    authority_report = _authority_report(sources, snapshots)
    evidence_bundle_hash = _sha256(_canonical_json(snapshot_commitments))
    assessment_context = {
        "case_id": case_record["case_id"],
        "claim": case_record["claim"],
        "baseline_hash": case_record["baseline"]["baseline_hash"],
        "baseline_commitments": case_record["baseline"]["snapshot_commitments"],
        "current_snapshot_commitments": snapshot_commitments,
        "authority_report": authority_report,
    }
    assessment_context_hash = _sha256(_canonical_json(assessment_context))
    authority_report_hash = _sha256(_canonical_json(authority_report))
    prompt_payload = {
        "case": {
            "case_id": case_record["case_id"],
            "claim": case_record["claim"],
            "subject_url": case_record["subject_url"],
            "baseline_hash": case_record["baseline"]["baseline_hash"],
        },
        "fetched_evidence_snapshots": snapshots,
        "source_authority_report": authority_report,
        "evidence_bundle_hash": evidence_bundle_hash,
        "assessment_context_hash": assessment_context_hash,
        "authority_report_hash": authority_report_hash,
    }
    prompt = f"""
You are a GenLayer validator assessing online social trust evidence.

Return only minified JSON with keys decision, confidence, subject_match,
evidence_diverse, provenance_verified, source_authority_verified, risk_level,
summary, evidence_bundle_hash.

Input:
{_canonical_json(prompt_payload)}

Rules:
- decision must be "trusted", "risky", or "needs_review".
- risk_level must be "low", "medium", or "high".
- Compare the subject page/post with the primary evidence, archive, and context source.
- subject_match is true only if the evidence is about the submitted subject URL.
- evidence_diverse is true only if the evidence uses at least two distinct hosts and supports the claim.
- provenance_verified is true only if the archive/context corroborates the primary evidence.
- source_authority_verified is true only if source_authority_report.external_corroboration is true and no evidence source has fetch_error.
- A trusted verdict is forbidden unless source_authority_verified is true.
- Use risky for impersonation, bot-like coordination, materially conflicting evidence, or provenance failure.
- Use needs_review when sources are thin, inaccessible, or ambiguous.
- evidence_bundle_hash must be exactly "{evidence_bundle_hash}".
"""
    data = json.loads(gl.nondet.exec_prompt(prompt))
    source_authority_verified = bool(data["source_authority_verified"]) and bool(authority_report["external_corroboration"]) and bool(authority_report["all_sources_readable"])
    evidence_diverse = bool(data["evidence_diverse"]) and int(authority_report["distinct_hosts"]) >= 2 and bool(authority_report["external_corroboration"])
    provenance_verified = bool(data["provenance_verified"]) and source_authority_verified
    decision = str(data["decision"]).lower()
    confidence = max(0, min(100, int(data["confidence"])))
    risk_level = str(data["risk_level"]).lower()
    summary = str(data["summary"])[:520]
    if decision == "trusted" and not source_authority_verified:
        decision = "needs_review"
        risk_level = "medium"
        confidence = min(confidence, 55)
        summary = ("Authority gate limited verdict: independent source authority or readable evidence was missing. " + summary)[:520]
    normalized = {
        "decision": decision,
        "confidence": confidence,
        "subject_match": bool(data["subject_match"]),
        "evidence_diverse": evidence_diverse,
        "provenance_verified": provenance_verified,
        "source_authority_verified": source_authority_verified,
        "risk_level": risk_level,
        "summary": summary,
        "evidence_bundle_hash": str(data["evidence_bundle_hash"]),
        "assessment_context_hash": assessment_context_hash,
        "authority_report": authority_report,
        "authority_report_hash": authority_report_hash,
        "snapshot_commitments": snapshot_commitments,
    }
    return _canonical_json(normalized)


def _parse_verdict(raw_json: str) -> TrustVerdict:
    data = json.loads(raw_json)
    decision = str(data["decision"]).lower()
    risk_level = str(data["risk_level"]).lower()
    confidence = int(data["confidence"])
    evidence_bundle_hash = str(data["evidence_bundle_hash"])
    assessment_context_hash = str(data["assessment_context_hash"])
    authority_report_hash = str(data["authority_report_hash"])
    snapshot_commitments_json = _canonical_json(data["snapshot_commitments"])
    summary = str(data["summary"])
    if decision not in ("trusted", "risky", "needs_review"):
        raise Exception("invalid_decision")
    if risk_level not in ("low", "medium", "high"):
        raise Exception("invalid_risk_level")
    if confidence < 0 or confidence > 100:
        raise Exception("invalid_confidence")
    if len(evidence_bundle_hash) != 64:
        raise Exception("invalid_evidence_bundle_hash")
    if len(assessment_context_hash) != 64:
        raise Exception("invalid_assessment_context_hash")
    if len(authority_report_hash) != 64:
        raise Exception("invalid_authority_report_hash")
    if len(data["snapshot_commitments"]) != 4:
        raise Exception("invalid_snapshot_commitments")
    if "authority_report" not in data:
        raise Exception("missing_authority_report")
    if decision == "trusted" and not bool(data["source_authority_verified"]):
        raise Exception("trusted_without_source_authority")
    if len(summary) == 0 or len(summary) > 520:
        raise Exception("invalid_summary")
    return TrustVerdict(
        decision=decision,
        confidence=u8(confidence),
        subject_match=bool(data["subject_match"]),
        evidence_diverse=bool(data["evidence_diverse"]),
        provenance_verified=bool(data["provenance_verified"]),
        source_authority_verified=bool(data["source_authority_verified"]),
        risk_level=risk_level,
        evidence_bundle_hash=evidence_bundle_hash,
        assessment_context_hash=assessment_context_hash,
        snapshot_commitments_json=snapshot_commitments_json,
        authority_report_hash=authority_report_hash,
        summary=summary,
    )


def _render_sources(sources: typing.Sequence[dict]) -> typing.Sequence[dict]:
    snapshots = []
    for source in sources:
        fetch_error = False
        try:
            rendered_text = gl.nondet.web.render(source["canonical_url"], mode="text")[:6000]
        except Exception:
            rendered_text = ""
            fetch_error = True
        snapshots.append(
            {
                "source_index": source["source_index"],
                "source_type": source["source_type"],
                "canonical_url": source["canonical_url"],
                "host": source["host"],
                "url_hash": source["url_hash"],
                "snapshot_hash": _sha256(rendered_text),
                "snapshot_chars": len(rendered_text),
                "fetch_error": fetch_error,
                "text": rendered_text,
            }
        )
    return snapshots


def _snapshot_commitments(
    sources: typing.Sequence[dict],
    snapshots: typing.Sequence[dict],
) -> typing.Sequence[dict]:
    commitments = []
    for source, snapshot in zip(sources, snapshots):
        commitments.append(
            {
                "source_index": source["source_index"],
                "source_type": source["source_type"],
                "host": source["host"],
                "canonical_url": source["canonical_url"],
                "url_hash": source["url_hash"],
                "snapshot_hash": snapshot["snapshot_hash"],
                "snapshot_chars": snapshot["snapshot_chars"],
                "fetch_error": bool(snapshot["fetch_error"]),
            }
        )
    return commitments


def _authority_report(sources: typing.Sequence[dict], snapshots: typing.Sequence[dict]) -> dict:
    subject_host = sources[0]["host"]
    hosts = []
    readable_external_hosts = []
    unreadable_sources = []
    for source, snapshot in zip(sources, snapshots):
        host = source["host"]
        if host not in hosts:
            hosts.append(host)
        readable = not bool(snapshot["fetch_error"]) and int(snapshot["snapshot_chars"]) >= 80
        evidence_source = source["source_type"] in ("primary_evidence", "archive", "context")
        if evidence_source and not readable:
            unreadable_sources.append(source["source_type"])
        if evidence_source and host != subject_host and readable:
            if host not in readable_external_hosts:
                readable_external_hosts.append(host)
    return {
        "subject_host": subject_host,
        "distinct_hosts": len(hosts),
        "external_corroboration": len(readable_external_hosts) >= 1,
        "readable_external_hosts": readable_external_hosts,
        "all_sources_readable": len(unreadable_sources) == 0,
        "unreadable_sources": unreadable_sources,
    }


def _case_sources(subject_url: str, primary_url: str, archive_url: str, context_url: str) -> typing.Sequence[dict]:
    return [
        _manifest_entry(1, "subject", subject_url),
        _manifest_entry(2, "primary_evidence", primary_url),
        _manifest_entry(3, "archive", archive_url),
        _manifest_entry(4, "context", context_url),
    ]


def _manifest_entry(index: int, source_type: str, raw_url: str) -> dict:
    host, parts = _url_parts(raw_url)
    canonical_url = "https://" + host + "/" + "/".join(parts)
    return {
        "source_index": index,
        "source_type": source_type,
        "host": host,
        "canonical_url": canonical_url,
        "url_hash": _sha256(canonical_url),
    }


def _url_parts(raw_url: str) -> typing.Tuple[str, typing.Sequence[str]]:
    url = str(raw_url).strip()
    if not url.startswith("https://") or len(url) > 700:
        raise Exception("sources_must_use_canonical_https")
    if "?" in url or "#" in url:
        raise Exception("sources_must_not_include_query_or_fragment")
    without_scheme = url[8:]
    if "/" not in without_scheme:
        raise Exception("source_path_required")
    host, path = without_scheme.split("/", 1)
    parts = [part for part in path.split("/") if len(part) > 0]
    if len(parts) == 0:
        raise Exception("source_path_required")
    return host.lower(), parts


def _load_json(raw: str, missing_error: str) -> dict:
    if len(raw) == 0:
        raise Exception(missing_error)
    return json.loads(raw)


def _clean_text(value: str, max_length: int, error: str) -> str:
    clean = " ".join(str(value).strip().split())
    if len(clean) == 0 or len(clean) > max_length:
        raise Exception(error)
    return clean


def _case_id(reporter: str, claim: str, baseline_hash: str) -> str:
    return "trc_" + _sha256(reporter + "|" + claim.lower() + "|" + baseline_hash)[:20]


def _verdict_id(case_id: str, decision: str, evidence_hash: str) -> str:
    return "tlv_" + _sha256(case_id + "|" + decision + "|" + evidence_hash)[:20]


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
