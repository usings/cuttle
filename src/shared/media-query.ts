import { useEffect, useState } from "react"

/**
 * Whether the viewport matches — `null` until it has been measured.
 *
 * That third value is not pedantry: `matchMedia` is unreadable to a server render and to the
 * hydration render that has to match it, so a caller whose two layouts are genuinely different
 * components has to wait rather than render one and swap. A caller that only needs a default in the
 * meantime compares against `true` and gets one.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])

  return matches
}
