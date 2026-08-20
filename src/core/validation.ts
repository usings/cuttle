import { ValidationError } from "./errors"

/**
 * The three checks every definition validator in this codebase is built from — the rule chain's
 * (`core/nodes/processors/validate.ts`) and the subscription's (`core/subscriptions/schema.ts`).
 *
 * Shared rather than copied because both are compatibility surfaces: each validates what an API
 * caller sent *and* what the store read back, so a message or a bound that drifted between them would
 * mean a definition this deployment wrote and can no longer read.
 */

export function fail(message: string): never {
  throw new ValidationError(message)
}

/** A definition may only carry the fields its own rule declares; a stray one is a typo, not intent. */
export function onlyKeys(input: Record<string, unknown>, allowed: string[], name: string) {
  const unknown = Object.keys(input).find((key) => !allowed.includes(key))
  if (unknown) fail(`${name} has an unknown field ${unknown}.`)
}

/**
 * Length is measured before trimming, so a value padded up to the bound is over it. `allowEmpty`
 * returns the value as it came: a replacement string of spaces is a replacement.
 */
export function text(value: unknown, name: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") fail(`${name} must be a string.`)
  const output = value.trim()
  if (!allowEmpty && !output) fail(`${name} must not be empty.`)
  if (value.length > maxLength) fail(`${name} must not exceed ${maxLength} characters.`)
  return allowEmpty ? value : output
}
