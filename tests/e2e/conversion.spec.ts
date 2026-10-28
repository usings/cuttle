import { expect, test } from "@playwright/test"

test("the target picker excludes retired clients and the Worker still converts local input", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const replies: string[] = []
    const NativeWorker = window.Worker
    Object.defineProperty(window, "__compileReplies", { value: replies })
    // Observe replies from the real bundled Worker. A main-thread fallback must not satisfy this test.
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (String(url).includes("compile.worker")) {
          this.addEventListener("message", (event) => {
            const content = event.data?.output?.content
            if (typeof content === "string") replies.push(content)
          })
        }
      }
    }
  })
  await page.goto("/")
  await page.getByRole("combobox", { name: "目标客户端" }).click()
  await expect(page.getByRole("option", { name: "Surge Mac", exact: true })).toHaveCount(0)
  await expect(page.getByRole("option", { name: "Shadowrocket", exact: true })).toHaveCount(0)
  await page.getByRole("option", { name: "Surge", exact: true }).click()
  // Selecting a target observes a hydrated React event before editing the controlled textarea.
  await page
    .getByRole("textbox", { name: "节点源", exact: true })
    .fill("trojan://p@example.com:443#Browser")
  await expect(page.getByRole("button", { name: "生成", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "生成", exact: true }).click()
  await expect(page.locator("pre")).toContainText(
    'Browser = trojan, example.com, 443, password="p"',
  )
  await expect(page.getByRole("button", { name: "复制正文" })).toBeEnabled()
  const replies = await page.evaluate(() => Reflect.get(window, "__compileReplies") as string[])
  expect(replies).toContainEqual(
    expect.stringContaining('Browser = trojan, example.com, 443, password="p"'),
  )
})

for (const failure of ["missing", "creation", "post", "execution"] as const) {
  test(`conversion falls back and recovers when Worker failure is ${failure}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "missing") {
        Object.defineProperty(window, "Worker", { value: undefined })
        return
      }
      class RefusingWorker extends EventTarget {
        terminated = false
        constructor() {
          super()
          if (mode === "creation") throw new Error("Worker blocked")
        }
        postMessage() {
          if (this.terminated) throw new Error("Worker terminated")
          if (mode === "post") throw new Error("Worker refused message")
          queueMicrotask(() =>
            this.dispatchEvent(new ErrorEvent("error", { message: "Worker failed" })),
          )
        }
        terminate() {
          this.terminated = true
        }
      }
      Object.defineProperty(window, "Worker", { value: RefusingWorker })
    }, failure)
    await page.goto("/")
    await page.getByRole("combobox", { name: "目标客户端" }).click()
    await page.getByRole("option", { name: "Surge", exact: true }).click()
    const input = page.getByRole("textbox", { name: "节点源", exact: true })
    await input.fill("trojan://p@example.com:443#Fallback")
    await page.getByRole("button", { name: "生成", exact: true }).click()
    await expect(page.locator("pre")).toContainText(
      'Fallback = trojan, example.com, 443, password="p"',
    )
    await input.fill("trojan://p@example.com:443#Recovered")
    await page.getByRole("button", { name: "生成", exact: true }).click()
    await expect(page.locator("pre")).toContainText(
      'Recovered = trojan, example.com, 443, password="p"',
    )
    await expect(page.getByText("无法处理输入", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "复制正文" })).toBeEnabled()
  })
}
