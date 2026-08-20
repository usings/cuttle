import { env } from "cloudflare:workers"
import { afterEach, describe, expect, test } from "vitest"
import { authorizeAdminRequest } from "@/server/admin-auth"

const configured = env.CUTTLE_TOKEN

// The binding is declared as a string, but a deployment that never set the secret has none at all.
function withToken(token: string | undefined) {
  ;(env as unknown as Record<string, string | undefined>).CUTTLE_TOKEN = token
}

function request(credential?: string) {
  return new Request("https://example.com/api/v1/subscriptions", {
    headers: credential === undefined ? {} : { Authorization: `Bearer ${credential}` },
  })
}

afterEach(() => {
  withToken(configured)
})

describe("the door to subscription management", () => {
  test("the operator's own token is honoured whatever its length", async () => {
    withToken("abc")
    expect(await authorizeAdminRequest(request("abc"))).toBe("authorized")
  })

  test("a token that only resembles the configured one is turned away", async () => {
    withToken("abc")
    expect(await authorizeAdminRequest(request("abd"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request("abcd"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request("ab"))).toBe("unauthorized")
  })

  test("a request carrying no credential is turned away", async () => {
    withToken("abc")
    expect(await authorizeAdminRequest(request())).toBe("unauthorized")
    expect(await authorizeAdminRequest(request(""))).toBe("unauthorized")
  })

  test("a scheme other than Bearer carries no credential", async () => {
    withToken("abc")
    const basic = new Request("https://example.com/api/v1/subscriptions", {
      headers: { Authorization: "Basic abc" },
    })
    expect(await authorizeAdminRequest(basic)).toBe("unauthorized")
  })

  test("a deployment with no token configured authorizes nothing", async () => {
    withToken(undefined)
    expect(await authorizeAdminRequest(request("abc"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request(""))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request())).toBe("unauthorized")
  })

  test("a deployment with an empty token authorizes nothing", async () => {
    withToken("")
    expect(await authorizeAdminRequest(request("abc"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request(""))).toBe("unauthorized")
  })

  test("a deployment whose token is only whitespace authorizes nothing", async () => {
    withToken("   ")
    expect(await authorizeAdminRequest(request("abc"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request("   "))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request(""))).toBe("unauthorized")
  })

  test("a stray newline around the configured secret does not lock the operator out", async () => {
    // What a hand-written dotenv file produces, and what nobody can type back into the field.
    withToken(" abc \n")
    expect(await authorizeAdminRequest(request("abc"))).toBe("authorized")
  })

  test("whitespace around the presented credential is ignored too", async () => {
    withToken("abc")
    expect(await authorizeAdminRequest(request("  abc"))).toBe("authorized")
    expect(await authorizeAdminRequest(request("abc  "))).toBe("authorized")
  })

  test("trimming does not let a different token through", async () => {
    withToken("abc")
    expect(await authorizeAdminRequest(request("a bc"))).toBe("unauthorized")
    expect(await authorizeAdminRequest(request("ab c"))).toBe("unauthorized")
  })
})
