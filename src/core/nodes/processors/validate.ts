import { fail, text } from "@/core/validation"
import type { ProcessorField } from "../types"
import { MAX_PATTERN_LENGTH, VALID_REGEXP_FLAGS } from "./shared"

/**
 * Re-exported rather than imported separately by each rule: this module is the whole validation kit a
 * processor is written against, and three of its checks are the ones every definition validator in
 * this codebase shares (`core/validation.ts`). A rule file needs one import either way.
 */
export { fail, onlyKeys, text } from "@/core/validation"

/** The fields a rule may name. `ProcessorField` in `../types` is this list, not a copy of it. */
export const PROCESSOR_FIELDS = ["name", "type", "server", "port"] as const
/**
 * Compiled here rather than at apply time, so an unusable pattern is refused at the edge instead of
 * becoming a diagnostic on every future delivery.
 */
export function regexp(pattern: unknown, flags: unknown, name: string) {
  const parsedPattern = text(pattern, `${name}.pattern`, MAX_PATTERN_LENGTH, true)
  const parsedFlags = flags == null ? undefined : text(flags, `${name}.flags`, 8, true)
  if (parsedFlags != null && !VALID_REGEXP_FLAGS.test(parsedFlags)) {
    fail(`${name}.flags has an invalid flag.`)
  }
  try {
    RegExp(parsedPattern, parsedFlags)
  } catch {
    fail(`${name}.pattern is not a valid regular expression.`)
  }
  return { pattern: parsedPattern, flags: parsedFlags }
}

export function processorField(value: unknown, name: string, fallback?: ProcessorField) {
  if (value == null && fallback) return fallback
  if (!PROCESSOR_FIELDS.includes(value as ProcessorField)) {
    fail(`${name} must be one of ${PROCESSOR_FIELDS.join(", ")}.`)
  }
  return value as ProcessorField
}

export function fieldList(value: unknown, name: string) {
  if (value == null) return
  if (!Array.isArray(value)) fail(`${name}.fields must be an array.`)
  return value.map((field, index) => processorField(field, `${name}.fields[${index}]`))
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
  message: string,
) {
  if (value == null) return
  if (!allowed.includes(String(value) as T)) fail(`${name} ${message}`)
  return value as T
}
