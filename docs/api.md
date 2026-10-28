# 订阅 API

下面的请求针对已部署的 Cuttle，或已迁移本地数据库的开发服务器。准备应用的 origin、管理密钥，以及响应中返回的订阅 ID 和 token。管理密钥与订阅 token 是两种不同凭据。

## 管理订阅

所有 `/api/v1/subscriptions` 及其子路径均要求：

```http
Authorization: Bearer <管理密钥>
```

管理响应使用 `Cache-Control: no-store`。创建、编辑和读取来源不会提前验证上游节点是否能连接；生成发生在订阅访问时。

| 方法与路径                              | 成功状态 | 响应                                                                               |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `GET /api/v1/subscriptions`             | `200`    | `{ "subscriptions": [...] }`，含摘要，不含完整来源或 token                         |
| `POST /api/v1/subscriptions`            | `201`    | `{ "subscription": {...}, "token": "...", "url": "..." }`                          |
| `GET /api/v1/subscriptions/<id>`        | `200`    | `{ "subscription": {...} }`，含来源和版本                                          |
| `PATCH /api/v1/subscriptions/<id>`      | `200`    | `{ "subscription": {...} }`                                                        |
| `POST /api/v1/subscriptions/<id>/token` | `200`    | 新 `token`、`url` 和 `subscription`；轮换后的读回失败时 `subscription` 可为 `null` |
| `DELETE /api/v1/subscriptions/<id>`     | `204`    | 无正文                                                                             |

### 创建

替换 origin、密钥和示例节点中的地址与密码。以下示例只配置订阅，不会连接示例代理：

```sh
export CUTTLE_ORIGIN='http://localhost:3000'
export CUTTLE_TOKEN='替换为管理密钥'
curl --fail-with-body "$CUTTLE_ORIGIN/api/v1/subscriptions" \
  -H "Authorization: Bearer $CUTTLE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Example","source":{"type":"raw","content":"trojan://replace-password@proxy.example.com:443#Example"},"defaultTarget":"surge","enabled":true}'
```

保存返回的 `subscription.id`、`subscription.version` 和一次性 `url`。再次 GET 不会返回完整 token。

| 字段            | 要求                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `name`          | 非空名称，最多 100 个字符                                                                            |
| `source`        | 文本：`{"type":"raw","content":"..."}`；远程：`{"type":"remote","urls":["https://example.com/sub"]}` |
| `defaultTarget` | [输出客户端](../README.md#输出客户端)中的目标；另支持 API 交换格式 `json`                            |
| `processors`    | 可选，按顺序执行的规则数组，最多 32 项；省略时无规则                                                 |
| `enabled`       | 可选布尔值，省略时为 `true`                                                                          |

文本来源按 UTF-8 字节计最多 2 MiB。远程来源最多 32 个 HTTP(S) 链接，不能在 URL 中携带用户名和密码；每个链接最多 4096 个字符，合计响应体最多 2 MiB。每个请求使用 10 秒超时，最多跟随 3 次重定向；目标主机须在该订阅列出的主机范围内，并通过公网地址检查。

### 编辑与版本冲突

PATCH 只提交要修改的字段。先 GET 获取当前 `version`，然后将它作为 `expectedVersion` 一并提交：

```json
{
  "name": "Renamed",
  "expectedVersion": 1
}
```

此处 `1` 仅为示例，应替换为实际读取的版本。成功后版本递增；版本已过期返回 `409`，不会覆盖来源或清理新版本的缓存。重新读取、合并需要保留的修改后再提交。

`expectedVersion` 可省略以兼容旧调用；省略时无法识别客户端早先打开的旧表单。管理界面保存时会携带版本。启停、修改来源或规则也会产生新版本。

### 错误

管理失败响应的形状为 `{"code":"...","error":"..."}`：

| 状态  | `code`               | 常见原因                           |
| ----- | -------------------- | ---------------------------------- |
| `400` | `invalid_request`    | 请求 JSON 无法读取                 |
| `401` | `unauthorized`       | 未提供正确管理密钥                 |
| `404` | `not_found`          | 订阅不存在                         |
| `409` | `conflict`           | 编辑版本过期，或并发写入发生冲突   |
| `422` | `invalid_definition` | 来源、目标、规则或版本条件无效     |
| `500` | `internal`           | 服务器故障；具体错误只记录在日志中 |

删除成功后可用 GET 确认返回 `404`。创建后不再需要的测试订阅也应删除。

## 获取订阅

`GET /subscribe/<token>` 不使用管理密钥；URL 中的 token 即为凭据。可附加 `?target=sing-box` 等[目标值](../README.md#输出客户端)，仅覆盖本次输出，不修改默认目标。

| 状态  | 含义                                                             |
| ----- | ---------------------------------------------------------------- |
| `200` | 返回编译正文；`X-Node-Count` 表示输出节点数                      |
| `304` | `If-None-Match` 与当前 ETag 完全匹配，无正文                     |
| `400` | 空目标或不支持的目标，包括已移除的 `surge-mac` 和 `shadowrocket` |
| `404` | token 无效或订阅已删除                                           |
| `410` | 订阅已停用                                                       |
| `502` | 来源或编译不可用，且没有可使用的旧缓存                           |
| `500` | 服务器故障                                                       |

### 刷新与缓存

源站按“订阅 ID + 输出目标”保存编译结果。相同订阅版本、且输出格式版本兼容的结果在生成后 60 秒内复用；过期后的请求触发重新读取和编译，不是后台定时刷新。输出格式版本和内容的 SHA-256 摘要共同形成不透明的 ETag，可原样用于 `If-None-Match`，不要自行拼接。

刷新失败时，可以返回生成时间距今不足 7 天、且订阅版本仍匹配的旧结果。`X-Cuttle-Stale: 1` 和 `Warning: 110` 标记这一情况。配置更新后不会使用旧版本结果兜底。没有节点可输出时，不会把空配置作为成功的长期订阅发布。

不兼容的输出格式缓存也不会用于失败兜底。升级后首次访问可能重新生成正文，并返回新的 ETag；不需要为此修改订阅来源或 token。

来源和缓存按订阅版本读取，返回正文或 `304` 前再次检查 token、启用状态与版本。若处理期间配置发生变化，会丢弃本次结果并使用原 token 重试一次；连续变化导致无法取得稳定结果时返回 `502`。检查完成后发生的变更，以及已经开始发送或被 HTTP 缓存保存的响应，仍受下面的缓存边界限制。

正文和 `304` 响应均声明：

```http
Cache-Control: public, max-age=60, stale-while-revalidate=300, stale-if-error=86400
CDN-Cache-Control: public, max-age=60, stale-while-revalidate=300, stale-if-error=86400
```

这些 HTTP 缓存规则与 D1 编译缓存不同。停用、删除或轮换会影响之后到达源站的请求，但已经缓存或下载的内容可能继续保留，不保证所有客户端立即失效。

上游的流量等允许转发的响应头会随结果保存。多个来源的同名响应头由后面的来源覆盖，不会自动累加套餐流量。
