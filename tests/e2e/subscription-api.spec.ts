import { expect } from "@playwright/test"
import { adminHeaders, test } from "../support/subscription-api"

for (const [method, path] of [
  ["GET", "/api/v1/subscriptions"],
  ["POST", "/api/v1/subscriptions"],
  ["GET", "/api/v1/subscriptions/missing"],
  ["PATCH", "/api/v1/subscriptions/missing"],
  ["DELETE", "/api/v1/subscriptions/missing"],
  ["POST", "/api/v1/subscriptions/missing/token"],
]) {
  test(`${method} ${path} requires management authorization`, async ({ request }) => {
    const response = await request.fetch(path, { method, data: {} })
    expect(response.status()).toBe(401)
    expect(response.headers()["cache-control"]).toBe("no-store")
    expect(await response.json()).toMatchObject({ code: "unauthorized" })
  })
}

test("delivers nodes, honors an ETag, and supports a per-request target override", async ({
  request,
  subscription,
}) => {
  const response = await request.get(subscription.url)
  expect(response.status()).toBe(200)
  expect(response.headers()["x-node-count"]).toBe("1")
  expect(await response.text()).toContain('Primary = trojan, example.com, 443, password="password"')
  const etag = response.headers().etag
  expect(etag).toBeTruthy()
  const unchanged = await request.get(subscription.url, { headers: { "If-None-Match": etag } })
  expect(unchanged.status()).toBe(304)
  expect(await unchanged.body()).toHaveLength(0)
  const encoded = await request.get(`${subscription.url}?target=v2ray`)
  expect(encoded.status()).toBe(200)
  expect(Buffer.from(await encoded.text(), "base64").toString("utf-8")).toContain(
    "trojan://password@example.com:443",
  )
  const metadata = await request.get(`/api/v1/subscriptions/${subscription.id}`, {
    headers: adminHeaders,
  })
  expect(await metadata.json()).toMatchObject({
    subscription: { defaultTarget: "surge", version: 1 },
  })
})

for (const target of ["surge-mac", "shadowrocket"]) {
  test(`rejects retired ${target} without changing the subscription`, async ({
    request,
    subscription,
  }) => {
    const rejected = await request.get(`${subscription.url}?target=${target}`)
    expect(rejected.status()).toBe(400)
    const update = await request.patch(`/api/v1/subscriptions/${subscription.id}`, {
      headers: adminHeaders,
      data: { defaultTarget: target },
    })
    expect(update.status()).toBe(422)
    const metadata = await request.get(`/api/v1/subscriptions/${subscription.id}`, {
      headers: adminHeaders,
    })
    expect(await metadata.json()).toMatchObject({
      subscription: { defaultTarget: "surge", version: 1 },
    })
  })
}

test("an empty target is rejected without changing the default delivery", async ({
  request,
  subscription,
}) => {
  const rejected = await request.get(`${subscription.url}?target=`)
  expect(rejected.status()).toBe(400)
  expect(rejected.headers()["cache-control"]).toBe("no-store")
  const delivered = await request.get(subscription.url)
  expect(delivered.status()).toBe(200)
  expect(await delivered.text()).toContain("Primary = trojan")
})

test("a stale form receives 409 and cannot overwrite the successful edit", async ({
  request,
  subscription,
}) => {
  const path = `/api/v1/subscriptions/${subscription.id}`
  const saved = await request.patch(path, {
    headers: adminHeaders,
    data: { name: "winner", expectedVersion: 1 },
  })
  expect(saved.status()).toBe(200)
  const stale = await request.patch(path, {
    headers: adminHeaders,
    data: { name: "loser", expectedVersion: 1 },
  })
  expect(stale.status()).toBe(409)
  expect(await stale.json()).toMatchObject({ code: "conflict" })
  const metadata = await request.get(path, { headers: adminHeaders })
  expect(await metadata.json()).toMatchObject({ subscription: { name: "winner", version: 2 } })
})

test("disable, enable, rotate and delete change origin access to the subscription", async ({
  request,
  subscription,
}) => {
  const path = `/api/v1/subscriptions/${subscription.id}`
  const disabled = await request.patch(path, {
    headers: adminHeaders,
    data: { enabled: false, expectedVersion: 1 },
  })
  expect(disabled.status()).toBe(200)
  const inactive = await request.get(subscription.url)
  expect(inactive.status()).toBe(410)
  const enabled = await request.patch(path, {
    headers: adminHeaders,
    data: { enabled: true, expectedVersion: 2 },
  })
  expect(enabled.status()).toBe(200)
  const rotated = await request.post(`${path}/token`, { headers: adminHeaders })
  expect(rotated.status()).toBe(200)
  const credential = await rotated.json()
  expect(credential.url).not.toBe(subscription.url)
  const oldCredential = await request.get(subscription.url)
  expect(oldCredential.status()).toBe(404)
  const newCredential = await request.get(credential.url)
  expect(newCredential.status()).toBe(200)
  const removed = await request.delete(path, { headers: adminHeaders })
  expect(removed.status()).toBe(204)
  const deleted = await request.get(credential.url)
  expect(deleted.status()).toBe(404)
})
