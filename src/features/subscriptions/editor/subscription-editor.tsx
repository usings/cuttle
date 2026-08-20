import { IconAlertCircle, IconAlertTriangle, IconEdit, IconPlus } from "@tabler/icons-react"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { cn } from "tailwind-variants"
import { SideSurface } from "@/components/side-surface"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
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
import { Textarea } from "@/components/ui/textarea"
import type { TargetId } from "@/core/nodes"
import type { SubscriptionDraft } from "@/core/subscriptions"
import { describeProcessor, mergeRuleChain, RuleChainForm, splitProcessors } from "@/features/rules"
import type { RuleChainSplit } from "@/features/rules"
import { SOURCE_TYPE_LABELS } from "../source-types"
import { TARGET_OPTIONS } from "../targets"
import {
  fieldError,
  invalidField,
  RemoteUrlCount,
  SECTIONS,
  SectionBody,
  SectionHeader,
  SOURCE_TYPE_ICONS,
} from "./editor-sections"
import { validateName, validateSource } from "./editor-validation"
import { sourceFromValues } from "./editor-values"
import type { EditorValues } from "./editor-values"

/**
 * Uncontrolled with respect to `values`: the manager remounts this with a fresh `key` whenever it
 * opens the editor, so `defaultValues` is always the draft the user asked for.
 */
export function SubscriptionEditor({
  onOpenChange,
  onOpenChangeComplete,
  onSave,
  open,
  values,
}: {
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  onSave: (draft: SubscriptionDraft, id?: string) => Promise<boolean>
  open: boolean
  values: EditorValues
}) {
  const [chain, setChain] = useState<RuleChainSplit>(() => splitProcessors(values.processors))

  const form = useForm({
    defaultValues: values,
    onSubmit: async ({ value }) => {
      const draft: SubscriptionDraft = {
        name: value.name,
        source: sourceFromValues(value),
        defaultTarget: value.defaultTarget,
        processors: value.processors,
        enabled: value.enabled,
      }
      if (await onSave(draft, value.id)) onOpenChange(false)
    },
  })

  const actions = (
    <form.Subscribe
      selector={(state) =>
        [state.canSubmit, state.isSubmitting, state.values.id, state.fieldMeta] as const
      }
    >
      {([canSubmit, isSubmitting, id, fieldMeta]) => {
        const broken = SECTIONS.filter((section) => invalidField(fieldMeta, section.field))
        return (
          <>
            {broken.length > 0 ? (
              <span className="mr-auto inline-flex items-center gap-2 text-[12.5px] font-medium text-destructive">
                <IconAlertTriangle className="size-3.75 shrink-0" />
                {broken.length} 处需要修正 · 分区 {broken.map((item) => item.id).join("、")}
              </span>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form="subscription-editor" disabled={isSubmitting || !canSubmit}>
              {id ? <IconEdit data-icon="inline-start" /> : <IconPlus data-icon="inline-start" />}
              {isSubmitting ? "保存中" : id ? "保存修改" : "创建订阅"}
            </Button>
          </>
        )
      }}
    </form.Subscribe>
  )

  return (
    <SideSurface
      actions={actions}
      bodyClassName="p-0"
      className="data-[side=right]:sm:max-w-lg data-[side=right]:xl:max-w-xl"
      description="订阅源、默认客户端和规则链会一起持久化。"
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      open={open}
      title={values.id ? "编辑订阅" : "创建订阅"}
    >
      <form
        id="subscription-editor"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Subscribe selector={(state) => [state.values, state.fieldMeta] as const}>
          {([current, fieldMeta]) => {
            const broken = SECTIONS.filter((section) => invalidField(fieldMeta, section.field))
            const isBroken = (id: string) => broken.some((section) => section.id === id)
            const sourceError = fieldError(fieldMeta, "sourceValue")

            return (
              <div className="flex flex-col">
                <SectionHeader id="01" title="基本信息" invalid={isBroken("01")} />
                <SectionBody>
                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field
                      name="name"
                      validators={{ onChange: ({ value }) => validateName(value) }}
                    >
                      {(field) => {
                        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor={field.name}>名称</FieldLabel>
                            <Input
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              aria-invalid={invalid}
                            />
                            {invalid ? (
                              <FieldError>{String(field.state.meta.errors[0] ?? "")}</FieldError>
                            ) : null}
                          </Field>
                        )
                      }}
                    </form.Field>

                    {/* Sits with the name rather than with the source: it describes what this
                        subscription renders as, not where its nodes come from. */}
                    <form.Field name="defaultTarget">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>默认客户端</FieldLabel>
                          <Select
                            items={TARGET_OPTIONS}
                            value={field.state.value}
                            onValueChange={(value) => field.handleChange(value as TargetId)}
                          >
                            <SelectTrigger id={field.name} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {TARGET_OPTIONS.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  </div>
                </SectionBody>

                <SectionHeader id="02" title="订阅来源" invalid={isBroken("02")} />
                <SectionBody>
                  {/* The source error belongs to the field below, but it is shown up here on the
                      type row: that row is the one thing always in view, and the box it describes
                      carries no label of its own. */}
                  <form.Field name="sourceType">
                    {(field) => (
                      <Field>
                        <FieldTitle>来源类型</FieldTitle>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <ButtonGroup>
                            {(["raw", "remote"] as const).map((option) => {
                              const Icon = SOURCE_TYPE_ICONS[option]
                              const active = field.state.value === option
                              return (
                                <Button
                                  key={option}
                                  type="button"
                                  size="sm"
                                  variant={active ? "default" : "outline"}
                                  aria-pressed={active}
                                  onClick={() => {
                                    if (active) return
                                    field.handleChange(option)
                                    form.setFieldValue("sourceValue", "")
                                  }}
                                >
                                  <Icon data-icon="inline-start" />
                                  {SOURCE_TYPE_LABELS[option]}
                                </Button>
                              )
                            })}
                          </ButtonGroup>
                          {sourceError ? (
                            <FieldError className="inline-flex items-center gap-1.5 text-[12.5px]">
                              <IconAlertCircle className="size-3 shrink-0" />
                              {sourceError}
                            </FieldError>
                          ) : null}
                        </div>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="sourceValue"
                    validators={{
                      onChange: ({ value }) => validateSource(value, current.sourceType),
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={Boolean(sourceError)}>
                        <Textarea
                          id={field.name}
                          name={field.name}
                          // The visible label is gone, so the accessible name has to be carried here.
                          aria-label={current.sourceType === "remote" ? "远程链接" : "订阅原文"}
                          className={cn(
                            "max-h-80 font-mono text-xs",
                            current.sourceType === "remote" ? "min-h-24" : "min-h-44",
                          )}
                          placeholder={
                            current.sourceType === "remote"
                              ? "多个链接需要换行或者使用 | 分隔"
                              : undefined
                          }
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          aria-invalid={Boolean(sourceError)}
                          spellCheck={false}
                        />
                        {current.sourceType === "remote" ? (
                          <RemoteUrlCount value={field.state.value} />
                        ) : null}
                      </Field>
                    )}
                  </form.Field>
                </SectionBody>

                <SectionHeader id="03" title="规则链" invalid={isBroken("03")} />
                <SectionBody>
                  <form.Field name="processors">
                    {(field) => (
                      // No label: the section header above already reads "规则链".
                      <Field>
                        <RuleChainForm
                          value={chain.rules}
                          onChange={(rules) => {
                            const next = { ...chain, rules }
                            setChain(next)
                            field.handleChange(mergeRuleChain(next))
                          }}
                        />
                        {chain.preserved.length > 0 ? (
                          <FieldDescription>
                            另有 {chain.preserved.length} 条这个表单没有对应行的规则：
                            {chain.preserved
                              .map(({ processor }) => describeProcessor(processor))
                              .join("、")}
                            。保存时按原位置原样保留。
                          </FieldDescription>
                        ) : null}
                      </Field>
                    )}
                  </form.Field>
                </SectionBody>

                {/* One switch needs no section of its own, so it closes the form as a single row. */}
                <form.Field name="enabled">
                  {(field) => (
                    <Field orientation="horizontal" className="px-4 py-4 md:px-8 md:py-5">
                      <FieldContent>
                        <FieldTitle>启用订阅</FieldTitle>
                        <FieldDescription>停用后订阅地址返回 410。</FieldDescription>
                      </FieldContent>
                      <Switch
                        aria-label="启用订阅"
                        checked={field.state.value}
                        onCheckedChange={field.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>
              </div>
            )
          }}
        </form.Subscribe>
      </form>
    </SideSurface>
  )
}
