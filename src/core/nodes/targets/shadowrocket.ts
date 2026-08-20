import { encodeBase64 } from "../base64"
import { defineTarget } from "./define"
import { renderUriNode, URI_PROTOCOLS } from "./shared/uri-node"

/**
 * A Shadowrocket subscription link serves the URI list, Base64 encoded as a whole — the same format
 * V2Ray subscribes to. The YAML and Surge-style documents Shadowrocket also reads are config files a
 * user imports by hand, not what sits behind a subscription URL.
 *
 * Snell and SSH go with the format: Shadowrocket runs both, but neither has a URI spelling.
 */
export const shadowrocketTarget = defineTarget({
  id: "shadowrocket",
  label: "Shadowrocket",
  protocols: URI_PROTOCOLS,
  transports: "all",
  notes: "Writes a Base64-encoded list of protocol URIs, not a YAML configuration.",
  uniqueNames: false,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "txt",
  renderNode: (node) => renderUriNode(node),
  assemble: (lines) => encodeBase64(lines.join("\n")),
})
