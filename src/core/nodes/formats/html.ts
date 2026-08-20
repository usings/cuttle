import type { SourceFormat } from "./types"

/**
 * An upstream that answered with a login page or an error page rather than a subscription. Saying so
 * is far more use than the pile of unreadable-line warnings the line reader would otherwise produce.
 *
 * `<html>` counts as well as a doctype: the pages this catches are the ones a portal or a proxy
 * emits by hand, and those are exactly the ones that leave the doctype off. Nothing else can start
 * this way — a proxy URI, a config file and a Base64 envelope all begin with something else — so the
 * wider test costs no format its own source.
 */
const HTML_START = /^(?:<!doctype\s+html|<html[\s>])/i

export const htmlFormat: SourceFormat = {
  id: "html",
  parse: ({ text }) =>
    HTML_START.test(text)
      ? {
          format: "html",
          drafts: [],
          diagnostics: [
            {
              level: "error",
              stage: "parse",
              code: "html-input",
              message: "The input is HTML, not a valid subscription.",
            },
          ],
        }
      : null,
}
