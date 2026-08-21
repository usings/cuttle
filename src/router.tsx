import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { noteAuthFailure } from "@/features/session"
import { routeTree } from "./routeTree.gen"

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: noteAuthFailure }),
    mutationCache: new MutationCache({ onError: noteAuthFailure }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  })
}

export function getRouter() {
  const queryClient = createQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
