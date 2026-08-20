import { toast } from "@/components/ui/toast"

export function showError(error: unknown, fallback: string) {
  showFailure(error instanceof Error ? error.message : fallback)
}

function showFailure(description: string) {
  toast.add({ title: "操作失败", description, type: "error" })
}

export function showSuccess(title: string, description?: string) {
  toast.add({ title, description, type: "success" })
}
