import { createFileRoute } from "@tanstack/react-router"
import { ExtractWorkbench } from "@/features/extract"
import type { StepKey } from "@/features/extract"
import { AppShell } from "@/features/shell"

export interface ExtractSearch {
  step?: StepKey
}

const STEP_VALUES = new Set<StepKey>(["source", "process", "output"])

function isStepKey(value: unknown): value is StepKey {
  return typeof value === "string" && STEP_VALUES.has(value as StepKey)
}

/**
 * Input from the address bar is not to be trusted: an invalid `step` falls back to no parameter at
 * all — which is the first step — rather than throwing. A hand-mangled URL should open the workbench
 * at its first step, not an error page.
 */
function parseExtractSearch(input: Record<string, unknown>): ExtractSearch {
  return isStepKey(input.step) ? { step: input.step } : {}
}

export const Route = createFileRoute("/")({
  validateSearch: parseExtractSearch,
  component: ExtractPage,
})

function ExtractPage() {
  return (
    <AppShell active="extract">
      <ExtractWorkbench />
    </AppShell>
  )
}
