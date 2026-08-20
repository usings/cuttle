import { decodeBase64 } from "../base64"
import type { Diagnostic, DraftEntry, DraftNode } from "../types"
import type { SourceFormat } from "./types"

interface SsdDocument {
  airport?: string
  port?: number
  encryption?: string
  password?: string
  plugin?: string
  plugin_options?: string
  servers?: Array<Record<string, unknown>>
}

function pluginOptions(value: unknown) {
  if (typeof value !== "string" || !value) return
  return Object.fromEntries(
    value.split(";").flatMap((item) => {
      const [key, ...rest] = item.split("=")
      return key ? [[key, rest.length > 0 ? rest.join("=") : true]] : []
    }),
  )
}

function parseSsd(source: string) {
  if (!source.trim().startsWith("ssd://")) return null
  const diagnostics: Diagnostic[] = []
  try {
    const document = JSON.parse(decodeBase64(source.trim().slice(6))) as SsdDocument
    const drafts: DraftEntry[] = (document.servers ?? []).flatMap((server, index) => {
      const host = String(server.server ?? "")
      const port = Number(server.port ?? document.port)
      if (!host || !Number.isInteger(port) || port <= 0) {
        diagnostics.push({
          level: "warning",
          stage: "parse",
          code: "invalid-ssd-node",
          message: `SSD node #${index + 1} is missing server or port; skipped.`,
        })
        return []
      }
      const plugin = String(server.plugin ?? document.plugin ?? "") || undefined
      const node: DraftNode = {
        type: "ss",
        name: String(server.remarks ?? `${document.airport ?? "SSD"} ${index + 1}`),
        server: host,
        port,
        cipher: String(server.encryption ?? document.encryption ?? ""),
        password: String(server.password ?? document.password ?? ""),
        udp: true,
      }
      if (plugin) {
        node.plugin = plugin
        node["plugin-opts"] = pluginOptions(server.plugin_options ?? document.plugin_options)
      }
      return [{ value: node, index }]
    })
    return { format: "ssd", drafts, diagnostics }
  } catch (error) {
    return {
      format: "ssd",
      drafts: [],
      diagnostics: [
        {
          level: "error" as const,
          stage: "parse" as const,
          code: "invalid-ssd",
          message:
            error instanceof Error
              ? `SSD subscription could not be parsed: ${error.message}`
              : "SSD subscription could not be parsed.",
        },
      ],
    }
  }
}

/** SSD is its own envelope: a Base64 JSON document listing one airport's Shadowsocks servers. */
export const ssdFormat: SourceFormat = {
  id: "ssd",
  parse: ({ text }) => parseSsd(text),
}
