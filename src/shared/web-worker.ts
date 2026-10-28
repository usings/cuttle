import { useCallback, useEffect, useRef, useState } from "react"

export interface UseWebWorkerReturn<TInput = unknown, TOutput = unknown> {
  isAvailable: boolean
  data: TOutput | null
  error: string | null
  post: (payload: TInput) => boolean
  terminate: () => void
}

/**
 * A worker script the page is not allowed to load — a CSP without `worker-src`, a bundle a proxy
 * blocked — must not take the page down with it. Kept outside the hook so the caught error does not
 * shadow the failure this reports through.
 */
function createWorker(factory: () => Worker) {
  try {
    return { worker: factory(), failure: null }
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Worker could not be created"
    return { worker: null, failure }
  }
}

/**
 * Owns a worker the bundler built: created once on mount, latest message and error tracked,
 * terminated on unmount.
 *
 * A factory rather than a source string, deliberately: a worker that has to import anything cannot
 * come from a string, because a Blob URL has no module graph to resolve against. Only the caller can
 * write the expression a bundler recognises — `new Worker(new URL("./x.worker.ts", import.meta.url),
 * { type: "module" })` — so only the caller can hand over the worker itself.
 *
 * `create` is read through a ref: an inline arrow would otherwise be a new function every render and
 * rebuild the worker with it. The ref is written in an effect rather than while rendering, so a
 * render React throws away cannot leave the latest factory behind. Mount order covers the first
 * pass — `useRef(create)` already holds it before any effect runs. `post` and `terminate` are stable
 * for the same reason `create` is, so an effect may depend on them.
 */
export function useWebWorker<TInput = unknown, TOutput = unknown>(
  create: () => Worker,
): UseWebWorkerReturn<TInput, TOutput> {
  const factory = useRef(create)
  const workerRef = useRef<Worker | null>(null)
  const [data, setData] = useState<TOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    factory.current = create
  })

  useEffect(() => {
    if (typeof Worker === "undefined") return
    const created = createWorker(factory.current)
    if (!created.worker) {
      // Creating the worker is the external system, and its refusal has nowhere else to be
      // observed — which is the one thing an effect is for.
      setError(created.failure)
      return
    }
    const worker = created.worker
    workerRef.current = worker
    setIsAvailable(true)

    worker.addEventListener("message", (event) => setData(event.data as TOutput))
    worker.addEventListener("error", (event) => {
      worker.terminate()
      workerRef.current = null
      setIsAvailable(false)
      setError(event.message || "Worker execution failed")
    })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const post = useCallback((payload: TInput) => {
    const worker = workerRef.current
    if (!worker) return false
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker API takes a transfer list.
      worker.postMessage(payload)
      return true
    } catch (error_) {
      worker.terminate()
      workerRef.current = null
      setIsAvailable(false)
      setError(error_ instanceof Error ? error_.message : "Worker could not accept the request")
      return false
    }
  }, [])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setIsAvailable(false)
  }, [])

  return { isAvailable, data, error, post, terminate }
}
