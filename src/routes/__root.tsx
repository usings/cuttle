import { QueryClientProvider } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/toast"
import { NotFound } from "@/features/shell"
import appCss from "../styles.css?url"

export interface RouterContext {
  queryClient: QueryClient
}

export interface RootSearch {
  connect?: true
}

function parseRootSearch(input: Record<string, unknown>): RootSearch {
  return input.connect === true ? { connect: true } : {}
}

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: parseRootSearch,
  head: () => ({
    meta: [
      {
        title: "Cuttle",
      },
      {
        name: "description",
        content: "Cuttle：通用代理节点转换器。提取、处理并发布多客户端订阅。",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="format-detection" content="telephone=no,email=no,address=no" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
        <HeadContent />
      </head>
      <body className="font-sans antialiased wrap-anywhere selection:bg-primary/15">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
