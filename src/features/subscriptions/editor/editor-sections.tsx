import { IconAlertTriangle, IconCloudDownload, IconFileText } from "@tabler/icons-react"
import type { ReactNode } from "react"
import { cn } from "tailwind-variants"
import { FieldDescription, FieldGroup } from "@/components/ui/field"
import { splitSourceUrls } from "../source-urls"
import { isHttpUrl } from "./editor-validation"

/**
 * The three field sections, in the order they are numbered. "发布状态" is deliberately absent: it is
 * a single switch, so it reads as one closing row rather than a section of its own.
 */
export const SECTIONS = [
  { id: "01", title: "基本信息", field: "name" },
  { id: "02", title: "订阅来源", field: "sourceValue" },
  { id: "03", title: "规则链", field: "processors" },
] as const

export const SOURCE_TYPE_ICONS = { raw: IconFileText, remote: IconCloudDownload } as const

type FieldMetaMap = Record<
  string,
  { errors: unknown[]; isTouched: boolean; isValid: boolean } | undefined
>

/**
 * A field only counts as broken once the user has been near it, matching what the field itself
 * shows — otherwise opening a blank draft would light up as broken before anything is typed.
 * Returns the message so a section can render an error for a field it does not itself own.
 */
export function fieldError(fieldMeta: FieldMetaMap, field: string) {
  const meta = fieldMeta[field]
  if (!meta?.isTouched || meta.isValid) return ""
  return String(meta.errors[0] ?? "")
}

export function invalidField(fieldMeta: FieldMetaMap, field: string) {
  return fieldError(fieldMeta, field).length > 0
}

/** Only rendered in remote mode, so a pasted 2 MiB source is never split just to be discarded. */
export function RemoteUrlCount({ value }: { value: string }) {
  const urls = splitSourceUrls(value)
  return (
    <FieldDescription>
      多个链接需要换行或者使用 | 分隔 · 已识别 {urls.filter((url) => isHttpUrl(url)).length} /{" "}
      {urls.length} 条
    </FieldDescription>
  )
}

/**
 * Sections are always open. Every one of them holds either a single control or two closely related
 * ones, so a collapsed row would have hidden one field behind one click and bought nothing; the
 * numbered header is here to group and to carry the error, not to fold.
 */
export function SectionHeader({
  id,
  invalid,
  title,
}: {
  id: string
  invalid: boolean
  title: string
}) {
  return (
    <div
      data-invalid={invalid}
      className="flex h-12 flex-none items-center gap-2.5 border-b bg-sidebar px-4 data-[invalid=true]:bg-destructive/6 md:gap-3 md:px-8"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center text-[10px] font-bold",
          invalid ? "bg-destructive/12 text-destructive" : "bg-muted text-foreground",
        )}
      >
        {id}
      </span>
      <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">{title}</span>
      {invalid ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.25 text-[11px] text-destructive">
          <IconAlertTriangle className="size-3" />1 处错误
        </span>
      ) : null}
    </div>
  )
}

export function SectionBody({ children }: { children: ReactNode }) {
  return (
    <div className="border-b px-4 py-5 md:px-8 md:py-6">
      <FieldGroup className="gap-5">{children}</FieldGroup>
    </div>
  )
}
