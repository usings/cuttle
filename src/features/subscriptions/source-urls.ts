/**
 * Splits the "远程" box into individual links. Newlines are the natural separator when pasting, and
 * `|` (half or full width) covers the single-line case.
 */
export function splitSourceUrls(value: string): string[] {
  return value
    .split(/[\n\r|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
