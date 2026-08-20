import { IconChevronRight } from "@tabler/icons-react"
import { useState } from "react"
import type { ReactNode } from "react"
import { cn } from "tailwind-variants"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SET_OPTIONS } from "@/core/nodes"
import { PROCESSOR_PRESETS } from "./presets"
import {
  PROCESSOR_FIELD_LABELS,
  processorLabel,
  SET_OPTION_CHOICES,
  SET_OPTION_LABELS,
  setOptionChoice,
  setOptionValue,
  SORT_FIELD_OPTIONS,
} from "./processor-labels"
import { setNodeOption, togglePreset } from "./rule-chain-state"
import type { RuleChainState, SortableField } from "./rule-chain-state"

type RuleKey = "filter" | "rename" | "sort" | "set-options"

/**
 * Fixed height, not vertical padding: with padding the row ends up as tall as whatever it happens to
 * contain — a 16.5px summary line in one row, an 18.4px switch in the next — so the chain staggered
 * against itself and against the output panel's tab strip, which states its own `h-10`. Always on the
 * inner element, never on the one carrying `ROW_STATE`'s border, or `border-box` eats a pixel of it
 * and the two kinds of row disagree again.
 */
const ROW = "flex h-10 w-full items-center gap-2.5 pr-4 pl-5 text-left"
const ROW_STATE = "border-b text-muted-foreground data-[configured=true]:text-foreground"
const ROW_INDEX = "font-mono text-[11px] text-muted-foreground"
const ROW_LABEL = "shrink-0 text-xs font-semibold tracking-[0.08em] uppercase"
/** Sits at the right edge next to the chevron, so every row's state reads down one line. */
const ROW_SUMMARY = "ml-auto truncate pl-2 text-xs text-muted-foreground"

const UNSET = "未启用"

/** Summary line for the collapsed rows, so the chain reads without expanding anything. */
function summarize(rules: RuleChainState) {
  const stated = SET_OPTIONS.filter((option) => rules.setOptions[option] !== undefined)
  return {
    "filter": rules.filterPattern || UNSET,
    "sort": rules.sortField
      ? `${PROCESSOR_FIELD_LABELS[rules.sortField]} · ${rules.sortDescending ? "降序" : "升序"}`
      : UNSET,
    "rename": rules.renamePattern ? rules.renameReplacement || "（清空名称）" : UNSET,
    "set-options":
      stated.length > 0
        ? stated
            .map(
              (option) => `${SET_OPTION_LABELS[option]}${rules.setOptions[option] ? "开" : "关"}`,
            )
            .join(" · ")
        : UNSET,
  }
}

function ExpandableRule({
  children,
  configured,
  index,
  label,
  onToggle,
  open,
  summary,
}: {
  children: ReactNode
  configured: boolean
  index: number
  label: string
  onToggle: () => void
  open: boolean
  summary: string
}) {
  return (
    <Collapsible
      data-configured={configured}
      className={ROW_STATE}
      open={open}
      onOpenChange={onToggle}
    >
      <CollapsibleTrigger className={cn(ROW, "group aria-expanded:bg-muted")}>
        <span className={ROW_INDEX}>{index}</span>
        <span className={ROW_LABEL}>{label}</span>
        <span className={ROW_SUMMARY}>{summary}</span>
        {/* One icon turned a quarter rather than two swapped, so the state change is something the
            control does rather than a cut between two icons. */}
        <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-aria-expanded:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-5 py-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function ToggleRule({
  checked,
  id,
  index,
  label,
  onCheckedChange,
}: {
  checked: boolean
  id: string
  index: number
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div data-configured={checked} className={ROW_STATE}>
      <div className={ROW}>
        <span className={ROW_INDEX}>{index}</span>
        <label htmlFor={id} className={ROW_LABEL}>
          {label}
        </label>
        <Switch
          id={id}
          aria-label={label}
          className="ml-auto"
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  )
}

/** The narrow panel's reading of `SET_OPTION_CHOICES`: all three at once, as a button group. */
function OptionTriState({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: boolean | undefined) => void
  value: boolean | undefined
}) {
  const current = setOptionChoice(value)
  return (
    <div className="flex items-center gap-2.5">
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <ButtonGroup aria-label={label}>
        {SET_OPTION_CHOICES.map((choice) => (
          <Button
            key={choice.value}
            type="button"
            size="xs"
            variant={choice.value === current ? "default" : "outline"}
            aria-pressed={choice.value === current}
            onClick={() => onChange(setOptionValue(choice.value))}
          >
            {choice.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  )
}

export function RuleChain({
  className,
  onChange,
  value,
}: {
  className?: string
  onChange: (rules: RuleChainState) => void
  value: RuleChainState
}) {
  const [openRule, setOpenRule] = useState<RuleKey | null>("filter")
  const summary = summarize(value)

  function toggleRule(rule: RuleKey) {
    setOpenRule((current) => (current === rule ? null : rule))
  }

  function patch(changes: Partial<RuleChainState>) {
    onChange({ ...value, ...changes })
  }

  function onPresetChange(type: string, enabled: boolean) {
    onChange(togglePreset(value, type, enabled))
  }

  // The rows read down in the order the rules run, because the chain is order-dependent: each rule
  // sees what the one above it produced.
  const presetsFrom = 4

  return (
    <div className={className}>
      <ExpandableRule
        index={1}
        label={processorLabel("filter")}
        configured={Boolean(value.filterPattern)}
        summary={summary.filter}
        open={openRule === "filter"}
        onToggle={() => toggleRule("filter")}
      >
        <Field>
          <FieldLabel htmlFor="rule-filter-pattern">正则</FieldLabel>
          <Input
            id="rule-filter-pattern"
            className="h-8 font-mono text-sm"
            placeholder="^HK|Hong Kong"
            value={value.filterPattern}
            onChange={(event) => patch({ filterPattern: event.target.value })}
          />
        </Field>
      </ExpandableRule>

      <ExpandableRule
        index={2}
        label={processorLabel("rename")}
        configured={Boolean(value.renamePattern)}
        summary={summary.rename}
        open={openRule === "rename"}
        onToggle={() => toggleRule("rename")}
      >
        <Field>
          <FieldLabel htmlFor="rule-rename-pattern">匹配正则</FieldLabel>
          <Input
            id="rule-rename-pattern"
            className="h-8 font-mono text-sm"
            placeholder="^(.*)$"
            value={value.renamePattern}
            onChange={(event) => patch({ renamePattern: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-rename-replacement">替换内容</FieldLabel>
          <Input
            id="rule-rename-replacement"
            className="h-8 font-mono text-sm"
            placeholder="Proxy $1"
            value={value.renameReplacement}
            onChange={(event) => patch({ renameReplacement: event.target.value })}
          />
        </Field>
      </ExpandableRule>

      <ExpandableRule
        index={3}
        label={processorLabel("sort")}
        configured={Boolean(value.sortField)}
        summary={summary.sort}
        open={openRule === "sort"}
        onToggle={() => toggleRule("sort")}
      >
        <Field>
          <FieldLabel htmlFor="rule-sort-field">排序字段</FieldLabel>
          <Select
            items={SORT_FIELD_OPTIONS}
            value={value.sortField}
            onValueChange={(next) => patch({ sortField: next as SortableField | "" })}
          >
            <SelectTrigger id="rule-sort-field" className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SORT_FIELD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center gap-2.5">
          <label htmlFor="rule-sort-descending" className="min-w-0 flex-1 truncate text-xs">
            降序
          </label>
          <Switch
            id="rule-sort-descending"
            aria-label="降序"
            checked={value.sortDescending}
            disabled={!value.sortField}
            onCheckedChange={(checked) => patch({ sortDescending: checked })}
          />
        </div>
      </ExpandableRule>

      {PROCESSOR_PRESETS.map((preset, index) => (
        <ToggleRule
          key={preset.value.type}
          id={`rule-toggle-${preset.value.type}`}
          index={presetsFrom + index}
          label={preset.label}
          checked={value.enabledPresets.includes(preset.value.type)}
          onCheckedChange={(checked) => onPresetChange(preset.value.type, checked)}
        />
      ))}

      <ExpandableRule
        index={presetsFrom + PROCESSOR_PRESETS.length}
        label={processorLabel("set-options")}
        configured={Object.keys(value.setOptions).length > 0}
        summary={summary["set-options"]}
        open={openRule === "set-options"}
        onToggle={() => toggleRule("set-options")}
      >
        {SET_OPTIONS.map((option) => (
          <OptionTriState
            key={option}
            label={SET_OPTION_LABELS[option]}
            value={value.setOptions[option]}
            onChange={(next) => onChange(setNodeOption(value, option, next))}
          />
        ))}
      </ExpandableRule>
    </div>
  )
}
