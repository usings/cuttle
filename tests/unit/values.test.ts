import { describe, expect, test } from "vitest"
import {
  asArray,
  asBoolean,
  asMegabits,
  asPort,
  asRecord,
  asString,
  booleanFlag,
  compactRecord,
  integer,
  stringArray,
} from "@/core/nodes/values"

describe("the coercions every format shares", () => {
  test("a record is a plain object and nothing else", () => {
    expect(asRecord({ a: 1 })).toStrictEqual({ a: 1 })
    expect(asRecord([1, 2])).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord("x")).toBeNull()
  })

  test("a port is an integer inside the range a client can dial", () => {
    expect(asPort(443)).toBe(443)
    expect(asPort("443")).toBe(443)
    expect(asPort(0)).toBeUndefined()
    expect(asPort(65_536)).toBeUndefined()
    expect(asPort(4.5)).toBeUndefined()
    expect(asPort("abc")).toBeUndefined()
  })

  test("a bandwidth is not held to the port range, and zero is a value", () => {
    // The two were one coercion, so every link faster than 65535 Mbps reached sing-box unstated, as
    // did every fractional one — and `0`, which Hysteria reads as "do not shape this direction".
    expect(asMegabits(100)).toBe(100)
    expect(asMegabits("100")).toBe(100)
    expect(asMegabits(0)).toBe(0)
    expect(asMegabits(100_000)).toBe(100_000)
    expect(asMegabits(2.5)).toBe(2.5)
    expect(asMegabits(-1)).toBeUndefined()
    expect(asMegabits("100 Mbps")).toBeUndefined()
    expect(asMegabits("")).toBeUndefined()
    expect(asMegabits(undefined)).toBeUndefined()
    expect(asMegabits(null)).toBeUndefined()
  })

  test("an empty string reads as absent rather than as a value", () => {
    expect(asString("a")).toBe("a")
    expect(asString("")).toBeUndefined()
    expect(asString(1)).toBeUndefined()
  })

  test("a non-array is an empty list and a non-boolean is absent", () => {
    expect(asArray([1])).toStrictEqual([1])
    expect(asArray("x")).toStrictEqual([])
    expect(asBoolean(false)).toBe(false)
    expect(asBoolean("false")).toBeUndefined()
  })

  test("compacting drops undefined, null and empty strings but keeps zero", () => {
    expect(compactRecord({ a: 1, b: undefined, c: null, d: "", e: 0 })).toStrictEqual({
      a: 1,
      e: 0,
    })
  })

  test("a string list arrives either as a list or comma separated", () => {
    expect(stringArray(["h3", "h2"])).toStrictEqual(["h3", "h2"])
    expect(stringArray("h3, h2")).toStrictEqual(["h3", "h2"])
    expect(stringArray([])).toBeUndefined()
    expect(stringArray("")).toBeUndefined()
  })

  test("an integer that cannot be read falls back", () => {
    expect(integer("8080")).toBe(8080)
    expect(integer(undefined, 7)).toBe(7)
    expect(integer("abc", 7)).toBe(7)
  })

  test("a flag distinguishes unstated from switched off", () => {
    expect(booleanFlag(null)).toBeUndefined()
    expect(booleanFlag(undefined)).toBeUndefined()
    expect(booleanFlag("0")).toBe(false)
    expect(booleanFlag("off")).toBe(false)
    expect(booleanFlag("1")).toBe(true)
    expect(booleanFlag("")).toBe(true)
  })
})
