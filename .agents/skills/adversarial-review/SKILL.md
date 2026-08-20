---
name: adversarial-review
description: Falsify code changes against their governing contract, reporting only change-induced, evidence-backed correctness, security, data integrity, compatibility, operability, or design failures. Use for requested adversarial, security-focused, or rigorous reviews; changes involving authentication, authorization, untrusted or remote input, persistence, migrations, concurrency, retries, public APIs, schemas, serialization, destructive behavior, or broad architecture; and reviews required by repository instructions. Skip documentation-only, formatting-only, generated-file, and behavior-preserving mechanical changes unless explicitly requested.
---

# Adversarial Review

Try to prove the delta wrong under realistic conditions:

**contract → delta → risk path → failure hypothesis → counter-evidence → finding or verdict**

Seek evidence, not a quota of findings.

## Review Workflow

### 1. Establish the Governing Contract

Identify the correctness oracle from the task, specification, public API/schema, repository instructions, tests, compatibility guarantees, existing behavior, and comments. Tests, behavior, and comments are evidence, not automatic authority. State the externally observable objective, preserved behavior, critical invariants, and assumptions; separate intentional from unrelated edits.

A documented repository convention is governing evidence only when it encodes a behavioral, architectural, security, persistence, compatibility, or operational invariant. Naming, formatting, style, and common local patterns alone are out of scope. Treat a convention violation only as a lead until it yields a concrete failure, violated invariant, compatibility/security/persistence/operational consequence, or materially increased modification risk that passes all four finding gates.

When sources conflict, favor evidence that is more explicit, authoritative for the affected boundary, externally observable, and behavior-specific; these are contextual signals, not a fixed hierarchy. Never choose silently. If the conflict cannot be resolved reliably, record the specific unresolved assumption.

### 2. Model the Delta and Spend the Review Budget

Inspect the diff, changed code, and directly coupled tests, types, schemas, migrations, configuration, and generated changes. Trace each affected behavior or contract through:

**input → validation → state transition → persistence/external effect → output → consumer**

Follow one semantic/contract hop—not merely a function-call edge—upstream to its input/guarantee and downstream to its consumer or persistence/external effect, crossing forwarding calls and unchanged files as needed. Also inspect negative space: removed validation/effects, bypasses, missing companion updates, and callers/consumers retaining old assumptions. Pursue only plausible threats to the objective or an invariant; expand farther only when evidence exposes another affected contract or invariant.

For a high-fan-out schema or API, group callers/consumers by contract, trust level, and side effects. Inspect one representative plus materially distinct variants; expand a group only for differing evidence or a candidate.

Review in this priority order:

1. threats to the objective or critical invariants;
2. changed trust boundaries, state, and compatibility paths;
3. generic robustness and concrete modification risk.

For each affected trust boundary, trace:

**input controller → execution privilege → reachable assets/capabilities → attacker capability delta**

Keep effort proportional to risk; prefer targeted tests and traces. Do not expand the third layer into an open-ended audit without evidence from the first two. Low-risk fast path: if tracing finds neither a critical-invariant threat nor a changed trust boundary, persisted state, compatibility surface, or non-trivial failure/recovery path, validate the affected behavior, counter-review any candidate, and stop without applying every lens.

### 3. Generate Concrete Failure Hypotheses

Apply only lenses relevant to an affected path:

* **Behavior/input:** wrong conditions or sources of truth; missing transitions; missing, malformed, duplicate, partial, reordered, stale, oversized, or oddly encoded input.
* **State/persistence/recovery:** exceptions/timeouts between effects; partial writes, cleanup, retries, constraints, old data, migration ordering/partial application, recovery, and old/new code-schema compatibility.
* **Concurrency/idempotency:** duplicate/simultaneous execution, stale reads, lost updates, ordering, and read-modify-write races.
* **Trust/security:** attacker capability changes across a trust boundary. Authentication/authorization bypass, confused deputy, SSRF, redirect/DNS abuse, injection, path traversal, secret handling, and data exposure are prompts; boundary/capability analysis remains the model.
* **Compatibility:** callers, routes, response shapes, defaults, serialized or persisted formats, configuration, and relied-upon behavior.
* **Operations:** unbounded work, amplification, resource cliffs, missing timeouts, swallowed errors, and insufficient failure context.
* **Design/invariants:** new duplicated sources of truth, business rules/policies, or state/invariant representations; parallel state that can drift; boundary leakage; symptom fixes leaving the governing invariant broken; or coupling/invariant multiplication requiring coordinated edits for one conceptual change across independently writable/evolving paths. Smells are leads, never findings by name. Report only a concrete divergence, inconsistent behavior, partial update, or realistic failure. A modification hazard must name the conceptual change, edit paths, and resulting divergence.

Express a candidate as:

> Given [contract and possible preconditions], when [a concrete input, event, failure, interleaving, retry, migration, bypassed companion path, or independently evolving change affects the path], then [an observable incorrect, unsafe, incompatible, unrecoverable, or divergent outcome violates the contract].

Verify the preconditions before pursuing a candidate. Exclude speculative micro-optimization, style, preference, abstract cleanliness, and complexity without a concrete failure.

### 4. Prove or Discard Each Candidate

Prefer reproduction with a focused test or existing command; otherwise use a direct trace. In standalone reviews, do not mutate code unless fixes were requested.

Try to disprove both failure and delta causality using upstream validation, type invariants, database constraints, transaction/framework semantics, callers, tests, and the base revision.

Report a finding only when all four gates pass:

* **Contract:** a named contract, invariant, or compatibility guarantee is violated.
* **Causality:** the delta introduced or newly exposed it, or materially amplified a pre-existing risk's likelihood or impact through reachability, frequency, attacker capability, blast radius, recovery cost, or equivalent means. An unchanged pre-existing issue is not a finding.
* **Evidence:** it survives counter-review with executable evidence or a concrete code/system trace.
* **Materiality:** impact is actionable; uncertainty alone is not a defect.

Discard candidates that fail any gate. Stop when high-risk paths are verified and every candidate has been counter-reviewed.

## Classify and Report

Use the least severe priority that fully reflects demonstrated impact:

* **P0 — Critical:** catastrophic/system-wide failure, irreversible data loss, or an exploitable boundary failure with comparable material impact; exploitability alone is insufficient.
* **P1 — High:** serious correctness, security, persistence, or compatibility defect that should block completion.
* **P2 — Medium:** concrete defect with constrained impact that should normally be fixed.
* **P3 — Low:** real, limited robustness or design/invariant defect with a concrete future failure mode or materially increased modification risk caused by the delta.

Assign confidence: `high` for reproduction/direct evidence; `medium` for strong evidence with one unverified condition; `low` when assumption-dependent. Report low confidence only when potential impact warrants attention.

Choose exactly one verdict:

* **PASS:** no finding needs a pre-completion fix and no specific unresolved risk remains. May include explicitly non-blocking P3 findings, not P2.
* **PASS WITH RISKS:** no finding needs a pre-completion fix, but a specific material assumption remains unverified or a known material risk was explicitly accepted. Generic uncertainty (for example, no production run or unknown concurrency problems) and confirmed P3 findings do not qualify.
* **CHANGES REQUIRED:** a confirmed material defect needs a pre-completion fix. P0/P1 normally require this; so does P2 unless its material risk is explicitly accepted.

With neither a required pre-completion fix nor a specific unresolved risk, return `PASS`.

Order findings by priority, then confidence; cite the narrowest useful file and line. Use:

```markdown
## Adversarial Review

**Verdict:** PASS | PASS WITH RISKS | CHANGES REQUIRED

### Findings

#### [P1][high] Concise title

- Contract: named source, invariant, or guarantee.
- Evidence: reproduced behavior or concrete trace.
- Change causality: introduced, exposed, or materially amplified by the delta.
- Failure scenario: Given → When → Then.
- Impact: concrete consequence.
- Minimal fix: smallest root-cause correction restoring the invariant.
- Verification: focused proof of the correction.

### Failure Scenarios Tested

- Important objective/invariant scenario or rejected high-risk candidate → result; if it does not fail, name the constraint/evidence preventing failure. Omit routine checks.

### Residual Risks

- Specific material unverified assumptions or explicitly accepted risks only.
```

With no findings, write `No material findings.` Summarize implementation only when needed to explain the verdict.

## Implementation Mode

When invoked within an implementation task:

1. Fix confirmed in-scope findings with the smallest root-cause correction that restores the existing invariant. Add abstraction, configuration, or machinery only if the current design cannot be repaired reliably.
2. Add regression tests when practical.
3. Rerun relevant validation.
4. Re-review the final diff against its governing contract; challenge the prior diagnosis, fix intent, and passing tests as evidence, not proof.

Do not expand into unrelated cleanup. The objective is the smallest robust change that survives serious attempts to break it, not a favorable review report.
