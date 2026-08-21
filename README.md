<p align="center">
  <img src="assets/home.png" alt="Cuttle 界面：左侧为节点来源，中间为规则链，右侧为生成结果" width="100%">
</p>

<p align="center">
  <a href="#功能概览">功能概览</a> ·
  <a href="#使用指南">使用指南</a> ·
  <a href="#自托管部署">自托管部署</a> ·
  <a href="#安全边界">安全边界</a>
</p>

Cuttle 是一个运行在 Cloudflare Workers 上的代理节点转换工具。它能自动识别节点或订阅内容，按规则完成筛选、重命名、排序与去重，再生成 Mihomo、Clash、sing-box、Surge、Loon 等客户端可以直接使用的格式。

临时转换无需登录；需要持续同步上游时，也可以保存为长期订阅，让客户端通过固定地址获取最新结果。应用和数据均保留在你自己的 Cloudflare 账户中。

## 功能概览

### 输入与协议

Cuttle 无需预先指定格式，可以直接识别：

- 节点 URI 列表、Base64 订阅和 SSD
- Clash / Mihomo YAML
- sing-box JSON、Xray / V2Ray JSON
- Surge、Loon、Quantumult X、Egern 节点行
- 包含节点信息的网页内容

来源可以是直接粘贴的文本，也可以是一个或多个远程订阅。多个远程来源会按填写顺序读取并合并。

支持的协议包括：SS、SSR、VMess、VLESS、Trojan、Hysteria、Hysteria 2、TUIC、AnyTLS、Snell、Mieru、WireGuard、SSH、HTTP(S) 和 SOCKS5。

### 规则处理

规则链中的步骤会依次执行，后一条规则处理前一条规则的结果。当前支持：

- 按名称正则筛选
- 使用正则表达式批量重命名
- 按名称或协议排序
- 过滤无效节点
- 添加地区旗帜
- 为重名节点自动编号
- 删除重复节点
- 批量设置 UDP、TFO 和跳过证书验证

规则不是必需的。规则链为空时，Cuttle 会直接转换识别出的节点。

### 输出客户端

Cuttle 支持 14 种输出格式：

| 客户端       | `target`       | 客户端       | `target`       |
| ------------ | -------------- | ------------ | -------------- |
| 通用 URI     | `uri`          | Mihomo       | `mihomo`       |
| Clash        | `clash`        | Stash        | `stash`        |
| sing-box     | `sing-box`     | Xray         | `xray`         |
| V2Ray        | `v2ray`        | Surge        | `surge`        |
| Surge Mac    | `surge-mac`    | Surfboard    | `surfboard`    |
| Egern        | `egern`        | Loon         | `loon`         |
| Quantumult X | `quantumult-x` | Shadowrocket | `shadowrocket` |

不同客户端支持的协议、传输方式和字段并不完全相同。Cuttle 只输出目标客户端能够准确表示的节点；无法兼容的节点会被跳过，并在诊断信息中说明原因，不会为了保留数量而生成失真的配置。

### 长期订阅

来源、规则链和默认输出格式可以保存为长期订阅：

- 文本来源会持续使用保存时的内容
- 远程来源会在每次访问时重新读取上游，再应用规则并生成结果
- 订阅支持编辑、启用、停用、轮换 token 和删除
- 普通编辑不会改变订阅地址，只有轮换 token 会立即废止旧地址
- 停用后的订阅地址返回 `410`，但保存的配置仍会保留

## 使用指南

### 完成一次转换

1. 在“源”中粘贴订阅内容，或连接管理密钥后填写远程订阅地址。
2. 按需添加并排列规则。
3. 在“输出”中选择目标客户端，然后点击“生成”。
4. 查看、复制或下载结果，并通过“节点”和诊断信息检查实际输出内容。

修改来源、规则或目标客户端后，已有结果会被标记为过期。再次点击“生成”即可刷新。

> 直接粘贴文本无需连接管理密钥。读取远程来源或管理长期订阅时，需要先使用部署时设置的管理密钥连接。

### 保存为长期订阅

完成一次生成后，可以将当前配置保存为订阅：

1. 点击“存为订阅”。
2. 填写一个便于识别的名称。
3. 确认来源、规则链、默认客户端和启用状态。
4. 保存后立即复制生成的订阅地址。

```text
https://cuttle.your-worker.workers.dev/subscribe/<token>
```

完整 token 只会在创建和轮换时显示一次。订阅地址本身就是访问凭据，请妥善保管。

### 用同一地址切换输出格式

在订阅地址后添加 `?target=`，可以临时指定输出格式，不会改变订阅保存的默认客户端：

```text
https://cuttle.your-worker.workers.dev/subscribe/<token>?target=sing-box
```

`target` 的可用值见上方[输出客户端](#输出客户端)表格。移除查询参数后，地址会恢复为订阅的默认格式。

## 自托管部署

推荐使用 **Fork + GitHub Actions** 的方式进行部署。整个过程无需在本机安装开发环境；GitHub Actions 会自动完成 D1 数据库创建、数据库迁移、密钥上传以及 Worker 发布。

### 1. Fork 仓库并启用 Actions

Fork 本仓库，然后打开 fork 的 **Actions** 页面并启用工作流。（GitHub 默认不会为新建的 fork 启用 Actions，因此需要手动开启）

### 2. 准备 Cloudflare 凭据

部署需要 Cloudflare **Account ID** 和 **API Token**。

**Account ID**

在 Cloudflare Dashboard 中按 <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>，搜索 `Copy account ID`；也可以前往 **Workers & Pages → Account details** 复制。

**API Token**

创建[账户令牌（account-owned token）](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/#create-an-account-owned-token)。

可以基于 **Edit Cloudflare Workers** 模板创建，并确保至少拥有以下权限：

| 权限            | 级别 | 用途                  |
| --------------- | ---- | --------------------- |
| Workers Scripts | Edit | 发布 Worker、上传密钥 |
| D1              | Edit | 创建数据库、应用迁移  |

### 3. 配置 GitHub Secrets

在 fork 的 **Settings → Secrets and variables → Actions** 中添加三个 Repository secret：

| Secret                  | 说明                           |
| ----------------------- | ------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API Token           |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID          |
| `CUTTLE_TOKEN`          | 用于登录 Cuttle 管理功能的密钥 |

其中，`CUTTLE_TOKEN` 是进入订阅管理功能的唯一凭据。若部署到公网，请务必使用足够长、随机且不可预测的字符串，并妥善保存。

> 三个 Secret 缺一不可。配置不完整时，相关部署步骤将失败或被跳过。

### 4. 运行部署

打开 **Actions → Deploy → Run workflow**。部署成功后，工作流会给出一个 `cuttle.*.workers.dev` 地址。

之后向仓库推送 `v*` 标签也会自动部署；运行 `pnpm release` 可以协助更新版本并创建标签。

### 5. 跟随上游更新

fork 中的 **Sync upstream** 工作流每天检查一次上游正式版本，也可以在 Actions 页面手动运行。

- 仅同步正式版本：只处理 `v*` 正式版本，自动跳过 `v1.0.0-rc.1` 等预发布版本
- 仅允许快进更新：如果 Fork 的默认分支包含自行提交的改动，工作流会停止并报错，不会覆盖现有内容
- 同步与部署相互独立：即使 Cloudflare Secrets 未配置完整，上游代码仍可正常同步，但不会继续触发部署
- 注意 GitHub 定时任务限制：长期无活动的公开仓库可能会被 GitHub 暂停 Scheduled Workflow；遇到这种情况，可进入 Actions 页面重新启用

如果你对 Fork 做过自己的修改，建议在同步上游前确认提交历史，避免因为分支无法快进而导致自动同步中断。

### 6. 绑定自定义域名（可选）

默认的 `cuttle.*.workers.dev` 地址可以直接使用。若要绑定自定义域名，请在 Cloudflare Dashboard 中打开该 Worker，并在域名与路由设置中添加 Custom Domain。

更换域名不会影响应用功能，但已经添加到客户端的订阅地址不会自动更新。

## 安全边界

- 订阅地址本身就是访问凭据；完整 token 只会在创建和轮换时显示一次
- 远程来源只允许 HTTP(S) 公网地址，并受链接数量、响应体积、重定向次数和请求超时限制
- 订阅来源和生成结果以明文保存在 D1 中；数据库导出文件同样包含完整订阅内容，应按敏感数据处理
- Cuttle 只提取、处理和转换代理节点，不生成规则集或完整客户端配置，也不会执行用户脚本
