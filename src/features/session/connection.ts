import { useIsFetching } from "@tanstack/react-query"

/** One flag for every admin request in flight, which is all the UI ever distinguished. */
export function useAdminBusy() {
  return useIsFetching() > 0
}
