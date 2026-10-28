# 部署与升级

## 首次部署：GitHub Actions

先准备一个可使用 Workers 和 D1 的 Cloudflare 账户，以及本仓库的 Fork。在 Fork 的 Actions 页面启用工作流。

在仓库的 **Settings → Secrets and variables → Actions** 中配置：

| Secret                  | 用途                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 允许部署 Worker、读取和创建 D1 数据库、应用迁移的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID                                          |
| `CUTTLE_TOKEN`          | Cuttle 的管理密钥；使用足够长、随机且不可预测的值           |

这些凭据须属于目标账户。API Token 至少需要对应账户的 Workers Scripts 编辑和 D1 编辑权限。三项 Secret 为空或只含空白时，部署工作流会停止。

运行 **Actions → Deploy → Run workflow**，并在运行界面选择要部署的分支或标签。工作流依次安装依赖、构建、确保名为 `cuttle` 的 D1 数据库存在、应用迁移，再上传管理密钥并部署 Worker。步骤定义在 [release.yml](../.github/workflows/release.yml)。

部署成功后，使用 Wrangler 输出的 Worker 地址访问应用，以 `CUTTLE_TOKEN` 连接管理功能。直接粘贴文本转换不需要连接。

推送 `v*` 标签也会触发部署。`pnpm release` 会更新版本并创建标签，执行前应先完成验证；它不是本地预览命令。

## 升级与迁移

升级前保留 D1 备份，并确认准备部署的代码和迁移来自同一版本。按 [D1 迁移机制](https://developers.cloudflare.com/d1/reference/migrations/)应用迁移后再发布 Worker。GitHub Actions 自动执行此顺序；手动部署需要自行执行远程迁移。

当前迁移：

| 文件                                                                         | 行为                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| [0001_create_schema.sql](../migrations/0001_create_schema.sql)               | 创建订阅、来源和编译缓存表                           |
| [0002_update_subscriptions.sql](../migrations/0002_update_subscriptions.sql) | 替换移除的默认目标、清理相关缓存，并安装并发版本保护 |

`0002` 将已有 `surge-mac` 默认目标转为 `surge`，将 `shadowrocket` 转为 `v2ray`。受影响的订阅版本递增，token、来源和规则保留；其缓存会在下一次访问时重建。其他订阅的默认目标不变。

不带目标参数的原订阅地址继续使用。显式包含 `?target=surge-mac` 或 `?target=shadowrocket` 的地址需更新，旧目标返回 `400`。

迁移失败时先查看失败步骤，不要继续部署新代码。不要删除已发布的迁移或手动把迁移记录标为成功。恢复后重试迁移；完成后再部署。回退 Worker 代码不等于回退数据库，恢复数据库需使用升级前的备份。

## 手动部署

先按[本地开发](development.md#本地运行)安装依赖，在终端配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。确认凭据能访问目标账户，且 `wrangler.json` 中的数据库名称与目标数据库一致。

首次部署时创建数据库；已有数据库跳过这一步：

```sh
pnpm exec wrangler d1 create cuttle
```

创建被 Git 忽略的 `.dev.vars.production`，只放准备好的生产管理密钥：

```dotenv
CUTTLE_TOKEN=替换为生产管理密钥
```

构建、应用远程迁移，再将密钥随代码一起上传：

```sh
pnpm build
pnpm db:migrate:remote
pnpm exec wrangler deploy --secrets-file .dev.vars.production
```

`--secrets-file` 使用 Cloudflare 的[随代码上传密钥](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code)机制。部署完成后删除临时密钥文件。`pnpm deploy` 自身不会执行数据库迁移，也不会读取这个额外密钥文件；上述步骤适用于首次手动部署和更新生产密钥。

部署后检查：主页能完成一次文本转换；连接管理密钥后能创建订阅；通过新订阅地址能获取正文。测试完成后删除该测试订阅。

## 跟随上游和域名调整

[Sync upstream](../.github/workflows/sync-upstream.yml) 每天检查正式的 `v数字.数字.数字` 标签，也可手动触发。它只执行快进同步；Fork 有独立提交、无法快进时会停止，需要先处理分支分歧。

同步与部署分开：缺少 Cloudflare 凭据或管理密钥时，同步仍可完成，但不会继续部署。长时间没有同步时检查 Actions 中定时工作流是否仍启用。

可在 Cloudflare 为 Worker 配置自定义域名。更换域名后，已保存在客户端中的订阅地址需要手动更新；数据库中的 token 不会因此改变。
