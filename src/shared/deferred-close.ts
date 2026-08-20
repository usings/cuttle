import { useState } from "react"

/**
 * Holds a surface open for its own exit animation, then reports the close.
 *
 * Whether a dialog is open lives in the URL here, so clearing it navigates the surface out of the
 * tree in the same commit that would have told it to close — it is already gone by the time it could
 * animate. The local flag is what the surface closes against; the navigation waits for
 * `onOpenChangeComplete`, which also keeps the unmount, and with it the `key` remount that gives
 * each open a fresh form.
 *
 * `open` going false on its own (the record vanished, the URL changed elsewhere) resets the flag, so
 * the next open does not start out already closing.
 */
export function useDeferredClose(open: boolean, onClosed: () => void) {
  const [closing, setClosing] = useState(false)
  const [tracked, setTracked] = useState(open)

  // Adjusted while rendering rather than in an effect: the reset has to be true of the same commit
  // the caller's `open` flips in. An effect would leave one committed frame where `open` has gone
  // true again and `closing` still says otherwise — the frame that reopens the surface already shut.
  if (tracked !== open) {
    setTracked(open)
    if (!open) setClosing(false)
  }

  return {
    onOpenChange: (next: boolean) => {
      if (!next) setClosing(true)
    },
    onOpenChangeComplete: (next: boolean) => {
      if (!next) onClosed()
    },
    open: open && !closing,
  }
}
