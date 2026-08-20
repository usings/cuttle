import type { SourceFormat } from "./types"

/** Nothing to read. Reported rather than treated as an unreadable format. */
export const emptyFormat: SourceFormat = {
  id: "empty",
  parse: ({ text }) => (text ? null : { format: "empty", drafts: [], diagnostics: [] }),
}
