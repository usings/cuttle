import { defineTarget } from "./define"
import { policyName } from "./shared/node-line"
import { SURGE_CAPABILITY, surgeNode } from "./surge"

/**
 * Surge for macOS reads the same node lines as Surge for iOS. A separate target because what people
 * ask for under this name is native macOS proxy lines — not a full configuration, and not the
 * external-proxy-program bridge to mihomo.
 */
export const surgeMacTarget = defineTarget({
  id: "surge-mac",
  label: "Surge Mac",
  ...SURGE_CAPABILITY,
  uniqueNames: true,
  renderedName: policyName,
  notes:
    "Writes native Surge for macOS node lines; not a full configuration and not the mihomo external-proxy bridge.",
  contentType: "text/plain; charset=utf-8",
  fileExtension: "conf",
  renderNode: (node) => surgeNode(node),
  assemble: (lines) => lines.join("\n"),
})
