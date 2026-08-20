import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
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
  processorLabel,
  SET_OPTION_CHOICES,
  SET_OPTION_LABELS,
  setOptionChoice,
  setOptionValue,
  SORT_FIELD_OPTIONS,
  SORT_ORDER_OPTIONS,
} from "./processor-labels"
import { setNodeOption, togglePreset } from "./rule-chain-state"
import type { RuleChainState, SortableField } from "./rule-chain-state"

/**
 * The editor's own rule chain, deliberately not the workbench's: that one is a scrolling column in
 * a narrow panel, where folding each rule away earns its keep. Here there is a full form section to
 * spend, so the rules that take arguments show their inputs outright and the ones that are only on or
 * off collapse into one grid — no row has to be opened to be read.
 */
export function RuleChainForm({
  onChange,
  value,
}: {
  onChange: (rules: RuleChainState) => void
  value: RuleChainState
}) {
  function patch(changes: Partial<RuleChainState>) {
    onChange({ ...value, ...changes })
  }

  // Every rule that takes no arguments is on or off, and those are exactly the presets: the three
  // that do take arguments have their inputs shown outright above.
  const toggles = PROCESSOR_PRESETS.map((preset) => ({
    checked: value.enabledPresets.includes(preset.value.type),
    id: `editor-rule-toggle-${preset.value.type}`,
    label: preset.label,
    onCheckedChange: (checked: boolean) =>
      onChange(togglePreset(value, preset.value.type, checked)),
  }))

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="editor-rule-filter-pattern">{processorLabel("filter")}</FieldLabel>
        <Input
          id="editor-rule-filter-pattern"
          className="font-mono text-xs"
          placeholder="^HK|Hong Kong"
          value={value.filterPattern}
          onChange={(event) => patch({ filterPattern: event.target.value })}
          spellCheck={false}
        />
      </Field>

      <Field>
        <FieldTitle>{processorLabel("rename")}</FieldTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel
              htmlFor="editor-rule-rename-pattern"
              className="text-[11px] text-muted-foreground"
            >
              匹配正则
            </FieldLabel>
            <Input
              id="editor-rule-rename-pattern"
              className="font-mono text-xs"
              placeholder="^(.*)$"
              value={value.renamePattern}
              onChange={(event) => patch({ renamePattern: event.target.value })}
              spellCheck={false}
            />
          </Field>
          <Field>
            <FieldLabel
              htmlFor="editor-rule-rename-replacement"
              className="text-[11px] text-muted-foreground"
            >
              替换内容
            </FieldLabel>
            <Input
              id="editor-rule-rename-replacement"
              className="font-mono text-xs"
              placeholder="Proxy $1"
              value={value.renameReplacement}
              onChange={(event) => patch({ renameReplacement: event.target.value })}
              spellCheck={false}
            />
          </Field>
        </div>
      </Field>

      <Field>
        <FieldTitle>{processorLabel("sort")}</FieldTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel
              htmlFor="editor-rule-sort-field"
              className="text-[11px] text-muted-foreground"
            >
              排序字段
            </FieldLabel>
            <Select
              items={SORT_FIELD_OPTIONS}
              value={value.sortField}
              onValueChange={(next) => patch({ sortField: next as SortableField | "" })}
            >
              <SelectTrigger id="editor-rule-sort-field" className="w-full">
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
          <Field>
            <FieldLabel
              htmlFor="editor-rule-sort-order"
              className="text-[11px] text-muted-foreground"
            >
              顺序
            </FieldLabel>
            <Select
              items={SORT_ORDER_OPTIONS}
              value={value.sortDescending ? "desc" : "asc"}
              onValueChange={(next) => patch({ sortDescending: next === "desc" })}
            >
              <SelectTrigger
                id="editor-rule-sort-order"
                className="w-full"
                disabled={!value.sortField}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SORT_ORDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Field>

      <div className="grid gap-x-8 md:grid-cols-2">
        {toggles.map((toggle) => (
          <label key={toggle.id} htmlFor={toggle.id} className="flex h-9 items-center gap-2.5">
            <span className="text-xs font-semibold tracking-[0.05em]">{toggle.label}</span>
            <Switch
              id={toggle.id}
              className="ml-auto"
              checked={toggle.checked}
              onCheckedChange={toggle.onCheckedChange}
            />
          </label>
        ))}
      </div>

      <Field>
        <FieldTitle>{processorLabel("set-options")}</FieldTitle>
        {/* Why there are three of them, and not two, is `SET_OPTION_CHOICES`'s docblock. */}
        <FieldDescription>不设置的开关保持来源里的原值。</FieldDescription>
        <div className="grid gap-4 md:grid-cols-3">
          {SET_OPTIONS.map((option) => (
            <Field key={option}>
              <FieldLabel
                htmlFor={`editor-rule-option-${option}`}
                className="text-[11px] text-muted-foreground"
              >
                {SET_OPTION_LABELS[option]}
              </FieldLabel>
              <Select
                items={SET_OPTION_CHOICES}
                value={setOptionChoice(value.setOptions[option])}
                onValueChange={(next) =>
                  onChange(setNodeOption(value, option, setOptionValue(next as string)))
                }
              >
                <SelectTrigger id={`editor-rule-option-${option}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SET_OPTION_CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}
        </div>
      </Field>
    </div>
  )
}
