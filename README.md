# TrustLens for GenLayer

TrustLens is a GenLayer-native social trust adjudication tool. It lets a user register a suspicious account, profile, post, or claim with supporting evidence URLs, then asks validators to fetch the same sources and produce a durable consensus verdict.

## Why it exists

GenLayer's recent messaging asks a hard question: who can you still trust online when humans are a minority on the internet? A local keyword score cannot answer that. TrustLens turns social trust checks into verifiable receipts:

- the subject, primary evidence, archive, and independent context URLs are normalized and preserved;
- validators fetch every source and bind each rendered snapshot with SHA-256 commitments;
- every accepted verdict is tied to a persistent `trc_*` case and `tlv_*` verdict ID;
- the contract stores the full source manifest, baseline hash, evidence bundle hash, and consensus result;
- the frontend calls the deployed GenLayer contract directly and reads the accepted records back from chain.

## Contract

`contracts/trust_lens.py`

Important methods:

- `register_case(...)` registers a subject URL, claim, primary evidence, archive, and context source. Validators recompute the same source commitments before a `trc_*` case is stored.
- `assess_case(...)` asks validators to assess the registered case. Validators fetch the evidence again, compare commitments, and store a `tlv_*` verdict.
- `get_case(...)`, `get_verdict(...)`, `list_case_ids()`, and `list_verdict_ids()` expose the persistent audit trail.

## Application

The web app has three user flows:

- `/case` creates a source-bound social trust case and reads the accepted `trc_*` record.
- `/assess` submits a registered case for consensus assessment and reads the accepted `tlv_*` verdict.
- `/records` reads case and verdict records from the deployed contract.

The application does not present a local mock verdict as a consensus result. The UI only displays records returned by the GenLayer contract.

## Example evidence

The `examples/` directory includes simple source pages for reviewers:

- `subject-profile.md`
- `social-trust-archive.md`
- `context-note.md`
- `primary-evidence.md`

These files provide canonical HTTPS GitHub URLs that can be used in Studio and in the live frontend.

## Checks

```bash
npm run contract:check
npm run contract:test
npm run flow:check
npm run build
```

`contract:check` verifies that the contract uses cryptographic commitments and exposes the required methods. `contract:test` models the register-assess lifecycle, duplicate prevention, evidence diversity checks, and persistent receipt IDs. `flow:check` checks that the frontend defaults and contract flow stay aligned.
