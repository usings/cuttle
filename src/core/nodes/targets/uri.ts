import { defineTarget } from "./define"
import { renderUriNode, URI_PROTOCOLS } from "./shared/uri-node"

/** A plain list of protocol URIs, which nearly every client can import by hand. */
export const uriTarget = defineTarget({
  id: "uri",
  label: "URI",
  protocols: URI_PROTOCOLS,
  transports: "all",
  uniqueNames: false,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "txt",
  renderNode: (node) => renderUriNode(node),
  assemble: (lines) => lines.join("\n"),
})
