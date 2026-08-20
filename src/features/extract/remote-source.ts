import { useMutation } from "@tanstack/react-query"
import { showError, showSuccess } from "@/shared/notify"
import * as api from "./api/server-fn"

/**
 * Reads a remote subscription the browser cannot fetch cross-origin itself. It goes through the
 * `readRemoteSource` server function rather than exposing a general-purpose HTTP proxy endpoint.
 */
export function useReadRemoteSource() {
  return useMutation({
    mutationFn: (urls: string[]) =>
      api.readRemoteSource({ data: { urls } }).then((payload) => payload.content),
    onSuccess: (_content, urls) =>
      showSuccess(urls.length > 1 ? `已获取 ${urls.length} 个远程订阅` : "已获取远程订阅"),
    onError: (error) => showError(error, "远程订阅读取失败。"),
  })
}
