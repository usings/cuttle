import { defineTarget } from "./define"
import { publicNode } from "./shared/public-node"

/**
 * The canonical model itself, serialized. Not a client: it is what the extract API answers with and
 * what a caller feeds back in, so it carries every node unchanged and refuses nothing.
 */
export const jsonTarget = defineTarget({
  id: "json",
  label: "Canonical JSON",
  protocols: "all",
  transports: "all",
  selectable: false,
  // The core's own model: it must read back exactly as it was handed in.
  uniqueNames: false,
  contentType: "application/json; charset=utf-8",
  fileExtension: "json",
  renderNode: (node) => publicNode(node),
  assemble: (nodes) => JSON.stringify(nodes, null, 2),
})
