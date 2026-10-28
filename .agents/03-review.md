# Review

Apply within the [Workflow](00-workflow.md).

## Establish the risk model

Separate facts, assumptions, and authorized exceptions. Trace producers and consumers beyond edited files to establish reachable inputs, trust boundaries, and compatibility or recovery obligations.

Check old data and clients when continued support is required, and deliberate rejection when it is not.

## Choose failure-oriented checks

Select cases relevant to the objective or an invariant:

- Missing, malformed, oversized, or unexpected inputs a relevant actor can supply.
- Retries, duplicates, concurrency, ordering, interruption, and restart.
- Stale artifacts, version mismatches, partial migrations, and recovery.
- Permission changes, partial read/write failures, and indirect paths across trust boundaries.

A passing build or happy path establishes only the claims it exercises.

## Independent review

When using independent review, ask the reviewer to challenge the author's model and inspect omitted paths. Preserve the reviewed state with a snapshot, commit, or separate worktree when concurrent work could change it. Use [Subagents](06-subagents.md) if delegating.

## Evidence and blocked verification

Support findings with a reproduction or causal trace naming the reachable input or state. Check omitted actors and paths before dismissing a case as hypothetical.

Pre-existing failures may block verification without authorizing unrelated repairs. Identify which claims remain unverified and whether an in-scope repair is needed.
