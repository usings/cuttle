import { MAX_REMOTE_URLS, MAX_SUBSCRIPTION_NAME_LENGTH } from "@/core/subscriptions"
import type { SubscriptionSource } from "@/core/subscriptions"
import { splitSourceUrls } from "../source-urls"

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * The same rules the API applies, so the form never accepts what the API would turn down. Length is
 * measured before trimming, exactly as the validator measures it — a name of a hundred characters
 * followed by a space is over the limit there, and has to read as over the limit here.
 */
export function validateName(value: string) {
  if (!value.trim()) return "名称不能为空。"
  if (value.length > MAX_SUBSCRIPTION_NAME_LENGTH) {
    return `名称不能超过 ${MAX_SUBSCRIPTION_NAME_LENGTH} 个字符。`
  }
}

export function validateSource(value: string, sourceType: SubscriptionSource["type"]) {
  if (!value.trim()) return "订阅来源不能为空。"
  if (sourceType !== "remote") return
  const urls = splitSourceUrls(value)
  if (urls.length === 0) return "请至少填写一个远程订阅链接。"
  if (urls.length > MAX_REMOTE_URLS) return `最多填写 ${MAX_REMOTE_URLS} 个链接。`
  for (const [index, entry] of urls.entries()) {
    try {
      const url = new URL(entry)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return `第 ${index + 1} 个链接只支持 HTTP 或 HTTPS。`
      }
    } catch {
      return `第 ${index + 1} 个链接不是有效 URL。`
    }
  }
}
