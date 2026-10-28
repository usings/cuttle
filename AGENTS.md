# Repository Guidelines

Scale work to risk. Change these guidelines only when authorized.

## Always apply

- Stay within the authorized objective; make routine implementation decisions autonomously and ask about material unresolved decisions.
- For an audit-only request, report findings without editing. Release or deploy only when explicitly requested.
- Verify the result and report material limitations.

## Load guidance by task

Start with Workflow for changes and assessments, then read the other guides whose triggers apply before doing that work. Load newly applicable guides when scope or risk changes. Reread only when a guide changes, its contents are no longer available, or a clause needs checking.

Read truncated portions before relying on a guide. Paths below are relative to this file.

| When                                                                                                                                 | Read                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Planning, implementing, or reviewing changes; assessing existing work                                                                | [00 — Workflow](.agents/00-workflow.md)           |
| Changing or reviewing code, dependencies, tooling, generated output, or contracts; before repository checks or releases              | [01 — Conventions](.agents/01-conventions.md)     |
| Choosing, writing, running, or reviewing tests; changing or auditing agent instructions or loading rules                             | [02 — Testing](.agents/02-testing.md)             |
| In-depth reviews, High risk, complex compatibility or recovery, or blocked verification                                              | [03 — Review](.agents/03-review.md)               |
| Designing or reviewing module interfaces, responsibility boundaries, or dependency direction; architecture refactoring or assessment | [04 — Architecture](.agents/04-architecture.md)   |
| Writing, editing, or auditing reader-facing documentation                                                                            | [05 — Documentation](.agents/05-documentation.md) |
| Before delegating or coordinating parallel work                                                                                      | [06 — Subagents](.agents/06-subagents.md)         |

Keep Workflow project-agnostic and project-specific rules in Conventions. Give each rule one home; update this index when triggers or paths change.
