# Conventions

Project-specific constraints and checks.

- Pushing a `v*` tag triggers remote D1 migrations and Worker deployment through `.github/workflows/release.yml`; `pnpm release` runs `bumpp` to update the version and create a tag.
- Prefer native Web APIs and preserve their stream, cancellation, and resource ownership semantics.
- Compatibility surfaces include target-client output, subscription APIs, and subscriptions stored in D1. Migrations live in `migrations/`.
- `src/routeTree.gen.ts` and `wrangler.d.ts` are generated; change their sources and regenerate unless explicitly required otherwise. Vite's TanStack Router integration generates the route tree; `pnpm typegen:worker` regenerates Worker types.

## Test resources

- `tests/fixtures/clients/` holds output snapshots. Update with `pnpm test:unit -u` only for intended output changes; review and summarize meaningful differences.
- Keep `tests/fixtures/corpus.json` covering supported input formats and every protocol a target declares. Load it through `tests/support/corpus.ts`.

## Verification commands

| Command                 | Coverage                                    |
| ----------------------- | ------------------------------------------- |
| `pnpm check:type`       | Strict TypeScript                           |
| `pnpm check:code`       | Oxlint and Oxfmt                            |
| `pnpm test:unit`        | Node tests in `tests/unit/`                 |
| `pnpm test:integration` | Worker/Miniflare/D1 in `tests/integration/` |
| `pnpm test:e2e`         | Playwright tests in `tests/e2e/`            |
| `pnpm build`            | Production build                            |

For bounded code changes, run affected tests and relevant type/code checks. For broad or uncertain effects, run type/code checks and all three test suites. Build when build, routing, or deployment integration is affected. Test projects are configured in `vitest.config.ts` and `playwright.config.ts`.
