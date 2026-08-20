# Repository Guidelines

## Repository-Specific Constraints

- D1 migrations live in `migrations/`.
- `tests/fixtures/clients/` is one golden file per output client, covering every corpus case.
  A diff there means rendered output changed; regenerate with `pnpm test:unit -u` only when that
  change was intended.
- `tests/fixtures/corpus.json` is meant to stay exhaustive: one case per input format, and at least
  one per protocol any client declares.
- Tests come in three kinds and no others: `tests/unit` (plain Node), `tests/integration`
  (Miniflare with real Worker bindings), `tests/e2e` (Playwright against the dev server).
- `src/routeTree.gen.ts` and `wrangler.d.ts` are generated; do not edit them manually unless explicitly required.

## Change Workflow

For bug fixes, runtime behavior changes, or changes spanning multiple modules:

**Model → Implement → Test → Attack → Simplify → Verify**

### 1. Model

Reason from the externally observable objective rather than from the current implementation.

Inspect only what is needed to establish:

- intended behavior and root cause;
- affected invariants and preserved behavior;
- trust boundaries and hard constraints;
- compatibility requirements;
- verified facts versus assumptions;
- the smallest viable change.

Relevant evidence may include implementation, callers, consumers, tests, types, schemas, persistence, migrations, and runtime behavior.

Treat existing code, tests, and behavior as evidence, not automatic truth. Expand inspection only when evidence shows the affected behavior crosses another boundary.

When multiple approaches satisfy the objective, prefer:

**correctness → simplicity → reversibility → consistency → cleverness**

Choose the smallest coherent solution with a narrow blast radius. Do not add abstractions, dependencies, configuration, compatibility behavior, or speculative flexibility without demonstrated need.

### 2. Implement

Make the smallest root-cause change that satisfies the model.

Preserve unrelated behavior. Prefer restoring existing invariants over introducing new machinery. Avoid unrelated refactors.

### 3. Test

Test externally observable behavior rather than implementation details.

Add focused regression coverage when practical. Exercise failure paths that can plausibly violate the objective or an affected invariant; do not enumerate unrelated permutations.

For migrations, validate existing data, partial application, recovery, and old/new code-schema compatibility.

### 4. Attack

After initial tests, try to falsify the changed behavior.

Always invoke `$adversarial-review` for changes involving:

- authentication, authorization, or security boundaries;
- remote input, URLs, or other trust-boundary handling;
- persistence, D1 schemas, or migrations;
- concurrency, idempotency, or retries;
- public APIs, schemas, or serialized formats;
- destructive operations;
- architectural changes with broad blast radius.

For other behavior changes with non-trivial failure modes, perform a focused falsification pass against the objective and affected invariants. Do not broaden it into a general repository audit.

Documentation-only, formatting-only, generated-file, and behavior-preserving mechanical changes do not require adversarial review unless explicitly requested.

If `$adversarial-review` finds an in-scope defect, fix the root cause, update regression coverage when practical, rerun affected validation, and review the resulting affected delta again.

### 5. Simplify

Once correctness is established, remove obvious unnecessary branches, state, indirection, duplication, configuration, or coupling introduced or exposed by the change.

Do not expand simplification into unrelated cleanup or trade clarity and correctness for fewer lines.

### 6. Verify

Validate the final delta on the changed surface:

- run affected tests;
- run strict TypeScript for changed TypeScript or types;
- run Oxfmt and Oxlint for changed source;
- exercise relevant Worker/D1 paths for changed runtime or persistence behavior.

Do not complete the change unless:

- the objective is satisfied and affected invariants hold;
- unintended compatibility changes are absent;
- relevant failure paths have been exercised;
- required validation passes against the final delta;
- required adversarial review has no blocking finding;
- no obvious unnecessary machinery introduced by the change remains;
- specific residual risks or unverified assumptions are reported.

Validation performed before review-driven edits does not count as final verification. Compilation or a passing happy path alone is not sufficient.

## Code Conventions

Formatting and static correctness are governed by Oxfmt, Oxlint, and strict TypeScript.

- Use `kebab-case.ts` filenames, PascalCase components, and camelCase symbols.
- Prefer tsconfig path aliases across modules and relative imports within a module.
- Prefer existing shadcn/Base UI components over custom primitives.
- Use semantic Tailwind tokens, `gap-*`, Tabler icons, and `cn()`.
- Add registry components with `pnpm dlx shadcn@latest`, then review generated code.
