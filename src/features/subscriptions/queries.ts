import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import type { TargetId } from "@/core/nodes"
import type { SubscriptionDraft, SubscriptionSummary } from "@/core/subscriptions"
import { hasAdminToken, setConnected, useAdminToken } from "@/features/session/admin-session"
import { ApiError } from "@/shared/api-error"
import { showError, showSuccess } from "@/shared/notify"
import type { CredentialPayload } from "./api/contract"
import * as api from "./api/server-fn"

const NO_SUBSCRIPTIONS: SubscriptionSummary[] = []

export function noteAuthFailure(error: unknown) {
  if (error instanceof ApiError && error.code === "unauthorized") setConnected(false)
}

// Credentials stay out of query keys; connect clears the cache before changing credentials.
export const keys = {
  snapshot: (id: string, target: TargetId) => ["subscriptions", id, "snapshot", target] as const,
  subscription: (id: string) => ["subscriptions", id] as const,
  subscriptions: ["subscriptions"] as const,
}

function subscriptionsQuery() {
  return queryOptions({
    queryKey: keys.subscriptions,
    queryFn: () => api.listSubscriptions().then((payload) => payload.subscriptions),
  })
}

function subscriptionQuery(id: string) {
  return queryOptions({
    queryKey: keys.subscription(id),
    queryFn: () => api.getSubscription({ data: { id } }).then((payload) => payload.subscription),
    staleTime: 0,
  })
}

function invalidateSubscriptions(client: QueryClient) {
  return client.invalidateQueries({ queryKey: keys.subscriptions })
}

export function useSubscriptions() {
  const token = useAdminToken()
  const query = useQuery({ ...subscriptionsQuery(), enabled: hasAdminToken(token) })
  return {
    failure: query.error,
    items: query.data ?? NO_SUBSCRIPTIONS,
    loaded: query.isSuccess,
  }
}

export function useSubscription(id: string | null) {
  const query = useQuery({ ...subscriptionQuery(id ?? ""), enabled: id !== null })

  useEffect(() => {
    if (query.error) showError(query.error, "加载订阅失败。")
  }, [query.error])

  return query.data ?? null
}

export function useSubscriptionSnapshot(id: string, target: TargetId, enabled: boolean) {
  const query = useQuery({
    queryKey: keys.snapshot(id, target),
    queryFn: () => api.readSubscriptionSnapshot({ data: { id, target } }).then((p) => p.snapshot),
    enabled,
  })

  return { failure: query.error, snapshot: query.data ?? null, loaded: query.isSuccess }
}

type SaveResult = CredentialPayload | undefined

async function discardResult(promise: Promise<unknown>): Promise<undefined> {
  await promise
}

export function useSaveSubscription() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ draft, id }: { draft: SubscriptionDraft; id?: string }): Promise<SaveResult> =>
      id
        ? discardResult(api.updateSubscription({ data: { id, patch: draft } }))
        : api.createSubscription({ data: { draft } }),
    onSuccess: async (_result, { id }) => {
      await invalidateSubscriptions(client)
      showSuccess(id ? "订阅已更新" : "订阅已创建", id ? undefined : "请立即保存新生成的订阅地址。")
    },
    onError: (error) => showError(error, "保存失败。"),
  })
}

export function useRemoveSubscription() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.removeSubscription({ data: { id } }),
    onSuccess: async () => {
      await invalidateSubscriptions(client)
      showSuccess("订阅已删除")
    },
    onError: (error) => showError(error, "删除失败。"),
  })
}

export function useRotateToken() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.rotateSubscriptionToken({ data: { id } }),
    onSuccess: async () => {
      await invalidateSubscriptions(client)
      showSuccess("token 已轮换", "旧订阅地址已失效，请保存新的订阅地址。")
    },
    onError: (error) => showError(error, "轮换失败。"),
  })
}

export function useSetSubscriptionEnabled() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({
      enabled,
      subscription,
    }: {
      enabled: boolean
      subscription: SubscriptionSummary
    }) => api.updateSubscription({ data: { id: subscription.id, patch: { enabled } } }),
    onSuccess: async (_result, { enabled }) => {
      await invalidateSubscriptions(client)
      showSuccess(enabled ? "订阅已启用" : "订阅已停用")
    },
    onError: (error) => showError(error, "状态更新失败。"),
  })
}
