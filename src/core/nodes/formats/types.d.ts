import type { Diagnostic, DraftEntry } from "../types"

export interface PreparedSource {
  /** The text to read, after any Base64 envelope and section extraction. */
  text: string
  /** The source arrived Base64 encoded. Only the line reader names its formats differently for it. */
  encoded: boolean
  /**
   * The text parsed as JSON or YAML, memoized so the up-to-2-MiB parse happens once however many
   * structured formats look at this source. `null` covers both "not a document" and "not attempted
   * yet" from the caller's side; the memoization itself still tells the two apart.
   */
  document(): unknown
}

/** What a format produces: the drafts it read and the name it wants that format reported under. */
export interface ParseOutput {
  format: string
  drafts: DraftEntry[]
  diagnostics: Diagnostic[]
}

/**
 * One way of reading a subscription. A format either recognises the source and returns a complete
 * result — including the name it wants reported — or returns `null` and lets the next one try.
 *
 * The name is the format's to give rather than the registry's, because for most it is an outcome of
 * parsing and not of detection: a structured document is `yaml`, `json` or `egern` depending on what
 * its entries turned out to be, and a line list is named after whichever line format was found.
 */
export interface SourceFormat {
  /** What this format is, for reading the registry. The reported format comes from `parse`. */
  id: string
  parse(input: PreparedSource): ParseOutput | null
}
