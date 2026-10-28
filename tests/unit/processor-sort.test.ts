import { describe, expect, test } from "vitest"
import { SORT_CASES, sortedNames } from "../support/sort-cases"

describe("sorting in Node", () => {
  test.each(SORT_CASES)("$name", ({ input, expected }) => {
    expect(sortedNames(input)).toStrictEqual(expected)
  })
})
