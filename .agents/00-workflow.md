# Workflow

Apply this workflow to changes and assessments.

**Model → Implement → Test → Simplify → Attack → Verify**, scaled to risk. Iterate as needed; for review-only tasks, assess the applicable steps without implementing.

## 0. Level

Classify by behavior, impact, and recovery cost, not edit size or file type. Changes to agent instructions can change behavior. Reassess when evidence or scope changes; honor the user's requested depth.

- **Light** — no behavior change. Implement → Verify.
- **Standard** — bounded behavior change without High risks. Use all steps; Attack may be a self-check.
- **High** — serious failure consequences, difficult recovery, or broad impact: security boundaries, breaking public or persisted contracts, destructive operations, or broad architecture changes. Use all steps and independent review when available and permitted; otherwise strengthen self-checks and disclose the limitation.

Investigate consequential uncertainty before choosing a lower risk level.

## 1. Model

Establish the observable objective, constraints, and acceptance criteria. Treat code, tests, and documentation as evidence, not unquestionable truth. For bugs, identify the failure mechanism. Trace affected inputs and consumers to establish invariants, boundaries, and compatibility; expand investigation as evidence requires.

Within the task's requirements, prefer **correctness → simplicity → reversibility → consistency**.

## 2. Implement

Make the change needed for the objective while preserving required behavior and compatibility. Avoid unrelated cleanup.

## 3. Test

Choose evidence capable of exposing relevant failures: tests, compilation, structural checks, inspection, or realistic walkthroughs. Define pass criteria before testing. Use [Testing](02-testing.md) for test design.

## 4. Simplify

Add abstractions, dependencies, configuration, or compatibility paths only for a present need. Remove unnecessary complexity introduced or exposed by the change without expanding scope or sacrificing correctness.

## 5. Attack

Challenge assumptions and probe plausible failures. A blocking finding needs a concrete regression, unmet requirement, or specific reason the result cannot be established; distinguish other concerns as notes. Surface risks promptly if they could change the user's next decision. Use [Review](03-review.md) when its trigger applies.

### Fixing

Fix findings at their cause within the authorized scope. Reassess risk and re-check every repair, including fixes to non-blocking notes. Revisit the design when patches repeatedly fail or accumulate exceptions.

## 6. Verify

Verify the final integrated result. Use focused checks when effects can be bounded and broader checks otherwise. Repeat affected checks after edits; reuse results only while their inputs and dependencies remain unchanged.

Report the outcome, checks and results, material compatibility effects, and unverified claims. Distinguish passed, failed, unrun, and blocked checks.
