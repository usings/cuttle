# 本地开发与测试

## 本地运行

准备 Node.js 24，以及 `package.json` 中指定版本的 pnpm。以下命令在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，把示例 `CUTTLE_TOKEN` 换成本地管理密钥。该文件被 Git 忽略。然后初始化本地 D1 并启动：

```sh
pnpm db:migrate:local
pnpm serve:dev
```

访问 `http://localhost:3000`。本地 D1 保存在 `.wrangler/state/`，本地迁移不操作远程数据库。首次运行或拉取新增迁移后都应先执行本地迁移；否则管理页面可能报告缺少表或数据库约束。

`pnpm serve:preview` 会先构建再启动预览。停止开发或预览服务时按 Ctrl+C。

## 选择验证范围

| 命令                    | 验证内容                                                   | 前置条件                                                         |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm check:type`       | 严格 TypeScript 类型检查                                   | 已安装依赖                                                       |
| `pnpm check:code`       | Oxlint 和 Oxfmt                                            | 已安装依赖                                                       |
| `pnpm test:unit`        | 输入、规范化、规则、客户端输出、HTTP 响应适配和会话状态    | Node 环境                                                        |
| `pnpm test:integration` | workerd 中的鉴权、真实 D1 持久化、并发、缓存交付和迁移恢复 | 能启动本地 Miniflare 服务                                        |
| `pnpm test:e2e`         | 浏览器会话、Worker 转换、实际 HTTP 路由和订阅生命周期      | 本地密钥、已迁移的本地 D1、Playwright Chromium、空闲的 3000 端口 |
| `pnpm build`            | 客户端和 Worker 的生产构建                                 | 已安装依赖                                                       |

安装 E2E 使用的浏览器：

```sh
pnpm exec playwright install chromium
```

对影响范围明确的修改，先跑相关测试及类型和代码检查。涉及转换链、存储、路由或未知影响时，执行完整检查：

```sh
pnpm check:type
pnpm check:code
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
```

可只运行一个文件，例如：

```sh
pnpm test:unit tests/unit/multi-source.test.ts
pnpm test:integration tests/integration/subscription-migration.test.ts
pnpm test:e2e tests/e2e/subscription-api.spec.ts
```

E2E 自动启动并关闭开发服务器。它使用 `.dev.vars` 中的管理密钥；若给测试进程设置 `CUTTLE_TOKEN` 环境变量，必须与服务器密钥一致。先停止占用 3000 端口的其他服务，避免测试连接到不同版本或不同密钥的应用。

集成测试使用测试专用 D1 绑定，自动建表；迁移测试从独立的旧版本数据库开始。E2E 使用本地开发数据库，只创建和删除自己拥有的测试订阅，不会清空数据库。强制终止测试可能留下名称以 `e2e-` 开头的订阅，可在订阅管理中删除。

## 测试的职责

- `tests/unit/` 验证纯转换、规则和适配结果，包括 IPv6 地址、TLS 保留与协议对应的传输限制；不通过对象引用是否相同来判断用户行为。
- `tests/integration/` 使用真实 Worker 和 D1。远程 HTTP 在边界替换，缓存年龄由受控时钟推进；并发测试用明确的读取屏障，不用睡眠猜测时序。
- 排序使用 `tests/support/sort-cases.ts` 的固定输入和预期，分别在 Node 单元测试和 workerd 集成测试中执行。
- `tests/e2e/` 验证需要浏览器或实际路由才能观察的行为，包括 SSR 水合、Worker 不可用或执行失败后的转换降级、密钥连接、管理路由鉴权、`304`、`409`、停用、轮换和删除。
- `tests/support/` 放共享样例、资源归属和清理。测试中断、数据库写入失败等场景不得依靠生产代码中的测试开关。

测试名称应说明失败时会损害的行为。使用固定输入和独立预期；不要把另一个实现函数的返回值当作预期。新增用例应能识别一条具体错误分支，避免仅检查常量存在、字段声明或重复记录内部调用。

## 输出语料与快照

[corpus.json](../tests/fixtures/corpus.json) 按协议组织输入样例，测试统一通过 [corpus.ts](../tests/support/corpus.ts) 读取。新增协议、输入格式或有差异的传输方式时，同时添加样例。`scopes` 记录该协议预期到达的客户端；每个样例必须实际解析出节点。

[clients/](../tests/fixtures/clients/) 保存每个输出目标的正文和拒绝诊断，用于检查输出稳定性。只有预期改变输出时才更新：

```sh
pnpm test:unit tests/unit/client-output.test.ts -u
```

更新后逐项检查 Git diff，并在提交说明中解释字段、凭据、节点数量或拒绝行为的变化。不要为消除失败而直接接受全部快照。

快照保留了已审查的输出，但不是客户端配置校验器。解析回自己的格式也不能独立证明目标客户端兼容；涉及客户端字段变更时，应依据目标格式的规范、模式或独立样例验证字段与拒绝行为。上述测试验证配置转换，不启动代理客户端或建立代理连接；远程部署也不属于本地测试的通过结论。

修改转换语义后，检查已有编译缓存是否还能安全使用。不能继续使用时，递增 [wrapper.ts](../src/core/subscriptions/wrapper.ts) 中的输出格式标识，并验证旧缓存不会被复用或用于失败兜底。订阅版本表示用户配置的变化，输出格式标识表示编译器的兼容性，两者分别检查。
