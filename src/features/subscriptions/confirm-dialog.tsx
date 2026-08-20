import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface ConfirmRequest {
  action: "rotate" | "delete"
  id: string
  name: string
}

const COPY = {
  rotate: {
    title: "轮换订阅 token？",
    description: "旧订阅地址会立即失效，必须重新分发新地址。",
    confirm: "轮换",
  },
  delete: {
    description: "订阅定义、编译快照和对应地址都会永久失效。",
    confirm: "删除",
  },
} as const

/**
 * One confirmation for both destructive actions, owned by the page rather than by the button that
 * asks for it. That placement is load-bearing: the detail dialog also asks for these, and a nested
 * alert dialog would unmount together with the dialog that contains it, so the prompt never lands.
 */
export function ConfirmDialog({
  onConfirm,
  onOpenChange,
  request,
}: {
  onConfirm: (request: ConfirmRequest) => void
  onOpenChange: (open: boolean) => void
  request: ConfirmRequest | null
}) {
  // The request being confirmed, latched: the dialog has to keep saying what it was asking about all
  // the way through its exit animation, and by then the caller has already cleared `request`.
  const [shown, setShown] = useState<ConfirmRequest | null>(null)
  const [tracked, setTracked] = useState(request)

  // Adjusted while rendering rather than in an effect, so the copy is right in the first committed
  // frame — an effect would open the dialog on the previous request and correct it a frame later.
  if (tracked !== request) {
    setTracked(request)
    if (request) setShown(request)
  }

  if (!shown) return null
  const copy = COPY[shown.action]

  return (
    <AlertDialog
      open={Boolean(request)}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open) setShown(null)
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {shown.action === "delete" ? `删除 ${shown.name}？` : COPY.rotate.title}
          </AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant={shown.action === "delete" ? "destructive" : "default"}
            onClick={() => onConfirm(shown)}
          >
            {copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
