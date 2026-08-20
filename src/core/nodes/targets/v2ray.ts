import { encodeBase64 } from "../base64"
import { defineTarget } from "./define"
import { renderUriNode, URI_PROTOCOLS } from "./shared/uri-node"

/**
 * V2Ray's subscription format is the URI list again, Base64 encoded as a whole. It is deliberately
 * not a V2Ray JSON configuration: what a client subscribes to is the encoded line list.
 */
export const v2rayTarget = defineTarget({
  id: "v2ray",
  label: "V2Ray",
  protocols: URI_PROTOCOLS,
  transports: "all",
  notes: "Writes a Base64-encoded list of protocol URIs, not a V2Ray JSON configuration.",
  uniqueNames: false,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "txt",
  renderNode: (node) => renderUriNode(node),
  assemble: (lines) => encodeBase64(lines.join("\n")),
})
