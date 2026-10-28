# Testing

Use [Conventions](01-conventions.md) for commands, test placement, and fixtures.

## Choose useful evidence

- Test observable requirements at the smallest layer that exercises them. Avoid tests that restate implementation or cover only cosmetic edits.
- Name the failure a test should catch. Derive expected values independently from requirements or checked fixtures, not from the implementation or helpers under test.
- Assert consumer-visible outcomes; pin exact strings or bytes only when the format is required. For regressions, reproduce the original failure where practical and cover relevant boundaries.
- Distinguish runtime behavior, type contracts, and output stability. Compile type assertions; supplement snapshots with behavioral checks when needed.

## Exercise real behavior

Exercise semantics in the runtime that owns them. Keep the component under test real; place doubles at slow or external boundaries and preserve relevant shapes, errors, and effects.

For persisted-format changes, check existing data, partial application, and recovery where affected.

Assert mock arguments, counts, or ordering only when they are part of the contract.

## Keep checks reliable

Reuse suitable helpers and fixtures. Prefer explicit synchronization and controlled clocks to sleeps. Ensure async checks terminate, clean up resources, and isolate mutable state between tests.

Keep test-only setup and cleanup in test utilities; production lifecycle methods should reflect actual resource ownership.

Check that an assertion would catch a plausible wrong branch, missing effect, or incorrect argument.

## Testing agent instructions

Check conflicts, precedence, load triggers, references, and formatting. Verify conditional guidance is reachable from the entry file; do not assume arbitrary files are discovered automatically.

When warranted, trial a realistic task in fresh context with the required tools and permissions, including affected loading or authorization behavior. Define pass criteria first; use baseline evidence before attributing an improvement. If trials are unavailable or disproportionate, report the static checks and their limits without claiming better execution.
