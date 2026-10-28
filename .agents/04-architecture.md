# Architecture

Apply these criteria within the [Workflow](00-workflow.md).

## Design useful modules

- Group behavior by coherent responsibility, not file size or language constructs. Keep related knowledge, changes, and verification together.
- Prefer interfaces that remove complexity from callers. Include the types, invariants, ordering, errors, and ownership callers must understand; keep implementation details private.
- Add extension points for demonstrated variation or external dependencies that need isolation, not hypothetical alternatives.
- Consider removing modules that add only forwarding or ceremony; retain those whose removal would spread complexity into callers.
- Test through caller-facing interfaces. Do not expose internals or fragment cohesive behavior merely to ease isolated testing.

## Find improvements from evidence

- Start with the user's area or observed friction. Use code, tests, design decisions, and relevant history as evidence; preserve established terminology.
- Trace representative behavior through callers and dependencies. Scattered concepts, repeated orchestration, leaked details, and tight coupling are investigation leads, not automatic reasons to refactor.
- For a recommendation, explain the evidence, affected responsibilities, expected improvement, costs, test implications, and confidence. Use a diagram only when it clarifies relationships.

## Carry the design through safely

Check responsibility and dependency changes against actual consumers, including errors and resource ownership. A private reorganization does not justify a public contract change.

Verify the interaction that motivated the change. Replace tests tied to superseded internals only when equivalent behavioral coverage remains.
