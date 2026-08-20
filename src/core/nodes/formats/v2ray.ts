import { asArray, asRecord } from "../values"
import type { SourceFormat } from "./types"
import { parseXrayOutbounds } from "./xray"

/**
 * V2Ray's own configuration file, which this core reads and does not write.
 *
 * Reading is Xray's parser verbatim: Xray forked V2Ray and kept the outbound shape, so the two
 * dialects differ by which fields appear rather than by where anything lives. What this file adds is
 * the name — an outbound whose `settings` holds `vnext` or `servers` is reported as V2Ray, not Xray.
 *
 * No writing side: a V2Ray subscription is not a configuration file but the Base64 line list the
 * `v2ray` target renders. A format with no matching target, as `ssd`, `html` and the platform line
 * formats already are.
 */
export const v2rayFormat: SourceFormat = {
  id: "v2ray",
  parse: (source) => {
    const value = source.document()
    const isV2Ray = asArray(asRecord(value)?.outbounds).some((item) => {
      const settings = asRecord(asRecord(item)?.settings)
      return Array.isArray(settings?.vnext) || Array.isArray(settings?.servers)
    })
    if (!isV2Ray) return null
    const { drafts, diagnostics } = parseXrayOutbounds(value)
    return { format: "v2ray", drafts, diagnostics }
  },
}
