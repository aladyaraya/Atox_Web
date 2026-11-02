# M001 · 邮箱认证模块

## M016 · 正式邮件准备（与本机 QQ 测试分开）

新增 production-mail.ts，MAIL_TRANSPORT=transactional-smtp；必须 production＋DEPLOYMENT_MODE=production＋PostgreSQL＋HTTPS正式域名＋已核验发信域名＋465 TLS，开发邮箱／OIDC／模拟支付同时关闭。SMTP_FROM 与认证用户名一致，校验证书，不降级／不自动重发／不记录验证码原文。原 send-code、verify-code、me、logout 和 AuthUser 不变，发送失败仍作废该次挑战并保留限额。

原有每邮箱、来源 IP 和挑战次数限制保留，新增正式发信全站小时额度 AUTH_MAX_SENDS_PER_HOUR（默认10000），防止无界发送；0013 仅追加发送时间索引。不扩大邮箱字段为收件人列表。大规模活动同一出口 IP 的真实登录也需要在内测时验证，不能用跳过限流换取通过。

数据库选择、生产配置及真实云验收门槛见 [M016](../../../deploy/README.md)。本机 .env.local、QQ 独立沙箱和 PGlite 数据不自动转成生产账号或管理员；真实 SMTP 域名／额度和实际海外收信尚需公司资源验收。

## 1.2.0 · 本机任意收件邮箱（2026-10-31）

按用户要求新增 `MAIL_TEST_ALLOW_ANY_RECIPIENT=true`，允许在 3105 登录表单填写任意单个有效收件地址；发信仍使用原 QQ SMTP。当前本机已显式开启，无该值或值非 true 时继续原单收件人限制。`MAIL_TEST_RECIPIENT` 在开放模式下只供 `mail:check` 指定测试邮件收件人，验证码以表单输入为准；开放模式可不填写它，单收件模式仍必填。示例默认 false。

保留邮箱规范化、每邮箱 60 秒间隔／每小时 5 次、每来源每小时 20 次、错误次数／过期／消费校验及发送失败处理；禁止将一个字段作为多收件人列表。仍只在 development、回环地址、隔离数据库及 OIDC 关闭时可用，生产禁止。真实邮箱／会话和迁移未修改。不同域名的自动化验证使用模拟 transport，不代表已实测各家的实际收信；实际发送由用户在页面发起。

本轮规则、配置与验证记录见 [SMTP 验收](../../../docs/M001-SMTP-VALIDATION.md)。以下 1.1.0 单收件人描述作为原验收基线保留；公开接口及 DTO 不变。

### 本机网页无法访问时

邮件测试入口是 `http://127.0.0.1:3105/login`。在项目目录运行 `npm run mail:preview`，保持该终端／后台进程运行；关闭进程或重启电脑后需重新启动。本地测试服务不是已部署的常驻网站，3000 原站与 3105 邮件沙箱是两个独立进程。先检查端口和终端日志，不通过删库、重置账号或修改凭据来解决进程停止。相同 PGlite 目录仍只允许一个进程，端口已被使用时先确认所属服务，不能重复启动同库。

2026-11-02 检查时 3000／3105 均无监听，对应开发进程已停止，旧日志未记录具体退出原因；重新启动独立邮件站并做回归，原数据库、会话、附件及 OIDC 开关未修改。

## 1.1.0 · 本机 QQ SMTP 投递增量（2026-10-30，本地验收通过）

真实测试邮件、首次验证码注册和退出后新码登录均已由用户确认；单进程核对独立测试库只有 1 个用户，第二次登录用户标识不变，开发邮箱没有真实验证码记录。141 项服务、原登录浏览器 3 项、生产保护 2 项、类型／Lint／隔离构建通过；原数据及 OIDC 模块保留。完整结果见下方验证记录，生产接入仍未完成。

新机器可将 [无密钥示例](../../../docs/examples/mail-test.env.example) 复制到 `.data/mail-test/.env.local` 后填写；已有本机文件不要覆盖。仅文件准备时可创建目录，不需要数据库迁移或管理员初始化。外发邮件内容实际交由 QQ 邮箱处理。

邮件适配新增 `smtp.ts`，登录页将邮箱认证可用性与开发邮箱预览分别判断。原 send-code／verify-code／me／logout 地址、用户、会话、验证码规则及数据库结构不变，无新增迁移。未指定 MAIL_TRANSPORT 时继续原开发邮箱；本轮不启用或修改 M013／M014 的身份关联和已有保护规则。

真实 SMTP 仅用于 development、回环 APP_ORIGIN、`.data/mail-test/` 子目录数据库且 OIDC 关闭的测试，当前限定 QQ SMTP TLS 465 和唯一测试收件人。production 始终禁止此本机适配，不等于生产邮件方案完成。`isEmailLoginEnabled` 是新增服务端公开入口，`isDevMailEnabled` 仅控制本地邮箱；SMTP 模式不保存验证码原文、不显示开发邮箱且 `/dev/mail` 返回 404。

先在 `.data/mail-test/.env.local` 私下配置 SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_FROM、SMTP_PASSWORD、MAIL_TEST_RECIPIENT、AUTH_SECRET。QQ 的 SMTP_FROM 必须与 SMTP_USER 相同，SMTP_PASSWORD 使用客户端授权码。不要复制或上传实际配置。`npm run mail:check` 向配置的测试收件人发送一封不含验证码的测试邮件，不打开数据库；`npm run mail:preview` 在 `http://127.0.0.1:3105/login` 启动独立站。启动器强制隔离数据、上传、构建目录和 OIDC／票务／开发邮箱开关，不覆盖根 `.env.local`；原站请继续用 localhost，避免不同端口共享同主机 Cookie。

先在共享写事务中提交限流记录和挑战摘要，再在事务及写队列之外等待 SMTP。发送拒绝或结果未知返回 `MAIL_DELIVERY_FAILED`（502、retryAfter 60），作废本次精确挑战、保留限流，不自动重发、不退回开发邮箱。重发后旧码仍失效；失效或超时邮件即使迟到也不能使用。`MAIL_RECIPIENT_NOT_ALLOWED`（400）拒绝本机允许名单之外的收件人，不保存发送记录。接口／日志不输出原文验证码、凭据或原始供应商错误；SMTP 接受不代表收件人已经收到。

本轮服务测试见 `tests/smtp-auth.test.ts`（模拟 transport，无真实外发），真实 SMTP 验证与人工收信／登录进度见 [验证记录](../../../docs/M001-SMTP-VALIDATION.md)。现有已绑定 OIDC 身份的开发 OTP 防旁路限制保留，不解绑或迁移用户；本机测试使用独立新账号。下文生产邮件未开发的历史描述指正式上线方案，仍未完成。

## M015 本人项目入口接入（2026-10-23）

账户页项目卡改为 `/account/projects`，M015 使用公开身份及资料纯服务读取默认公开昵称，不更改用户、会话、OIDC 或昵称 DTO，不以邮箱作为公开创作者默认值。投稿路由未登录经原安全 next 返回。业务权限、资格及附件由 M015 自行校验，见对应模块 README。

## M014 · 官网 OIDC 兼容增量

新增内部 [oidc](oidc/README.md)，官方 SDK 验证 Logto 并映射原 users.id，业务仍经 server.ts 使用原 AuthUser。0009 五表追加，不改旧模型／外键。未关联邮箱会话兼容，关联后撤销旧会话并拒绝开发 OTP，新增 OIDC_REQUIRED 错误码。仅开发显式开启；`npm run oidc:preview` 使用 3104／独立数据，不改真实 .env.local。同邮箱不合并，独立旧账号证据＋新鲜认证＋明确确认才绑定。生产始终关闭。下文 M013 是历史基线。

## M013 接入准备（2026-10-22，尚未切换）

Logto／OIDC 仅在 [独立实验](../../../labs/logto-oidc/README.md) 中验证，不新增本模块运行依赖或修改当前会话／认证接口。未来 SDK 与身份映射应放在本模块内部，其他业务继续经 server.ts 取得相同本地 AuthUser。保留 users.id、邮箱非空唯一和 M008 的本地授权；不将 Logto sub 或 roles 直接交给业务模块。

旧 verifyCode 按邮箱 upsert 只属于既有邮箱登录流程，不能复用于 OIDC 自动合并。开发验证码、开发邮箱和现有开发会话不是正式旧账号所有权证据；绑定、映射迁移及可信重新验证留到 [第二阶段](../../../docs/M013-INTEGRATION.md)。本轮没有修改此模块源代码或数据。

## 统一公开昵称兼容增量（2026-10-22）

新增 profile-schema.ts/account_profiles，不修改 users、验证码、会话及旧认证 DTO。server.ts 公开 getAccountProfile(user)、updateNickname(user,input)、getPublicNicknames(ids,reader?)；后者仅供服务端公开昵称投影，不提供按用户 ID 查询资料的公开 HTTP 接口。纯服务测试使用 profile.ts。

GET /api/account/profile 登录后返回 {nickname,revision}，未设置为 null/0；PUT 接收 {nickname,revision}，trim 后 2—30 Unicode 码点、拒绝控制字符、允许重名。修订冲突 409，不覆盖输入。浏览器 profile-client.ts，账户和首次评论复用 NicknameEditor。更新昵称不覆盖报名／订单姓名快照，也不影响认证或点赞资格。迁移 0008 与 M012 同次追加，配置不增加，完整验证见 M012 验收。

## 当前维护摘要（2026-10-10）

- 职责：身份与开发邮箱；不包含业务资格／角色。
- 公共接口：server.ts/getCurrentUser、findRegisteredUserByEmail；client.ts、contracts.ts；纯服务测试和 CLI 用 service.ts。
- 依赖与配置：共享 DB／写队列、语言及导航；AUTH_SECRET、APP_ORIGIN、DB_PATH、ENABLE_DEV_MAIL、TRUST_PROXY。
- 验证：auth.test.ts、return-path.test.ts；浏览器 login.spec.ts；test:production。服务文件用 `npx tsx --test tests/<文件>`，浏览器文件用 `npx playwright test tests/e2e/<文件>`；完整命令／隔离见 [运维](../../../docs/OPERATIONS.md)。
- 集成限制：0000 及账号／会话延续；生产验证码登录禁用。其他模块只经认证公开入口获得身份，再检查自己资源权限。

以下原交付记录保留历史语境；当前依赖和行为以上述摘要及最新接入段落为准。实际当前验证见 [仓库验收](../../../docs/REPOSITORY-VALIDATION.md)，原 zip 仅本地留存，源码使用 Git 追溯。

版本：**1.0.0（本地开发基线）**。业务范围：邮箱验证码注册／登录、会话查询与退出、开发邮件预览。此模块不包含活动报名、团队、支付、项目材料、业务角色或资源权限。

## 模块结构与接入入口

| 文件           | 职责                                                        |
| -------------- | ----------------------------------------------------------- |
| `server.ts`    | Next.js 服务端公开入口，使用 `server-only` 阻止客户端误导入 |
| `client.ts`    | 浏览器 API 调用与 `AuthClientError` 错误处理                |
| `contracts.ts` | 浏览器安全的请求／响应类型、用户类型、错误码及接口路径      |
| `service.ts`   | 注册、验证码、会话核心逻辑；不读取 Next.js Cookie           |
| `session.ts`   | Next.js Cookie 与核心服务之间的适配                         |
| `policy.ts`    | 验证码、限流与会话规则的集中配置                            |
| `schema.ts`    | 本模块拥有的数据表                                          |
| `mail.ts`      | 本地邮件适配和开发邮箱查询                                  |
| `http.ts`      | 认证接口的同源校验、IP 提取、JSON 限制与错误响应            |
| `components/`  | 登录、账户、邮件预览 UI                                     |

本模块依赖共享数据库 `src/lib/db.ts`，以及网站的语言提供器、导航／页脚和全局样式。它是单仓库内的业务模块，**不是可单独部署或直接复制即用的 npm 包**。

Next.js 路由保留在 `src/app/`，仅负责路由挂载和协议适配。旧的 `src/lib/auth.ts`、`mail.ts`、`http.ts` 仅为服务端兼容入口，新模块不要新增对此路径的依赖。`src/lib/schema.ts` 是全站数据库模型聚合入口，不是旧业务实现。

## 后续业务模块如何使用

服务端获取当前用户：

```ts
import { getCurrentUser } from "@/modules/auth/server";

const user = await getCurrentUser();
// 未登录返回 null；页面可 redirect('/login')，业务 API 应返回 401。
// user.id 是后续报名、团队、项目与订单的身份关联键。
```

浏览器调用：

```ts
import {
  sendLoginCode,
  verifyLoginCode,
  logout,
  AuthClientError,
} from "@/modules/auth/client";

await sendLoginCode({ email: "you@example.com", language: "zh" });
await verifyLoginCode({ email: "you@example.com", code: "123456" });
await logout();
// 失败抛 AuthClientError，包含 code 和可选 retryAfter。
```

纯服务测试直接导入 `service.ts`，不导入 Next.js 专用 `server.ts`。服务返回的用户时间是 `Date`；HTTP JSON 中序列化为 ISO 字符串。随机会话令牌仅在服务内部交给路由设置 Cookie，不属于公开用户 DTO。

后续模块必须在服务端验证身份，并自行校验资源归属；认证成功不等于拥有某团队、项目、订单或管理员权限。不得信任浏览器提交的 `userId` 作为身份，不得复制用户表或直接写入验证码／会话表。

## 已确定的业务规则

1. 邮箱去除首尾空白并转小写，不合并点号或 `+alias`。首次验证创建唯一用户，再次验证复用同一用户 ID。
2. 六位数字验证码，10 分钟有效；重发作废旧挑战，验证成功只能消费一次。
3. 同邮箱 60 秒内不可重发，每小时最多 5 次；同来源 IP 每小时最多 20 次。
4. 每条挑战最多错误 5 次；错误计数提交后再返回失败，防止事务回滚绕过次数限制。
5. 验证码摘要使用带密钥 HMAC；会话随机令牌仅保存 SHA-256 摘要。
6. 消费验证码、建立／复用用户和创建会话在同一事务内完成。当前进程写操作串行化，阻止并发重复消费。
7. 会话有效期 7 天且不续期。退出撤销当前会话，其他设备会话不受影响。
8. 修改接口检查 `Origin`，发送和验证仅接收不超过 4096 字节的 JSON。身份接口不缓存。
9. 本地开发邮箱只在 `NODE_ENV=development` 且 `ENABLE_DEV_MAIL=true` 时启用；不会发送真实邮件。

## HTTP 契约 v1

| 接口                         | 请求／成功响应                                                          | 错误                     |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `POST /api/auth/send-code`   | `{email,language:'zh'\|'en'}` → `{ok:true,retryAfter:60,expiresIn:600}` | 400、403、429、503、500  |
| `POST /api/auth/verify-code` | `{email,code}` → `{ok:true,user:{id,email,createdAt}}` + Cookie         | 400、403、429、503、500  |
| `GET /api/auth/me`           | `{user:{id,email,createdAt}}`                                           | 未登录 401 `{user:null}` |
| `POST /api/auth/logout`      | 无请求体 → `{ok:true}`                                                  | 403、500                 |

普通错误为 `{error:AuthErrorCode,retryAfter?:number}`，限流适用时带 `Retry-After` 响应头。完整错误码以 `contracts.ts` 为准。Cookie 名为 `hackathon_session`，`HttpOnly`、`SameSite=Lax`、路径 `/`，production 下为 `Secure`。公开响应中没有验证码、令牌或摘要。

页面挂载：`/login`、`/account`、`/dev/mail`。未登录访问 `/account` 跳转登录；首页根据会话显示账户入口。

M002 兼容接入：`/login?next=/events/demo/materials` 可在验证成功后返回站内目标页；已登录访问登录页也使用该目标。`return-path.ts` 校验参数并拒绝外站、协议相对地址、反斜杠、控制字符和登录循环，默认 `/account`。认证 HTTP 契约不变。所有认证与报名模块写操作改用共享 `src/lib/db.ts` 的 `serializeDatabaseWrite`，覆盖完整事务，禁止嵌套调用。原始 M001 1.0.0 归档保持不变，本段描述当前工作区的兼容增量。

## 数据所有权与迁移

M008 最小兼容增量：服务端公开 `findRegisteredUserByEmail(email)`，规范化邮箱并只读返回既有 `AuthUser` 或 null，供受控管理员授权和初始化查询。无新增 HTTP 用户检索接口，不发送验证码、不创建账号、不修改会话。生产邮件限制和其他认证规则不变。

本模块拥有 `users`、`challenges`、`sessions`、`send_events`、`dev_mails`。表名、字段、约束与历史迁移保持原样；本次模块化没有数据迁移，也不重置任何账号或会话。

原始迁移为 `drizzle/0000_auth.sql`，snapshot/journal 位于 `drizzle/meta/`。所有模块共享这一条版本化迁移历史；新增业务表通过新迁移追加，不修改已应用的认证迁移。后续实体关联 `users.id`，具体删除策略由其业务定义。

共享 DB 使用本地 PGlite、全局单例、磁盘目录持久化。单个目录只支持一个 Node 进程访问；服务运行期间不要另启迁移进程。测试使用独立临时数据，不清理用户本地数据库。

## 配置与部署边界

配置项：`AUTH_SECRET`（至少 32 字符）、`APP_ORIGIN`、`DB_PATH`、`ENABLE_DEV_MAIL`、`TRUST_PROXY`。环境变量和数据库数据不纳入源码版本控制。运行方法见根 README。

目前 production 下开发邮箱 404，发送／验证接口 503 `MAIL_DISABLED`。正式上线尚需真实邮件服务、HTTPS、可信代理配置、生产 PostgreSQL 及多进程下数据库级并发／限流设计。将来替换邮件适配时，需要同时调整服务的邮件可用性检查，不能只替换模板函数；真实发信应设计事务提交后的投递与失败处理。

不要将邮箱或会话令牌作为后续业务主键，不要在业务响应／日志复制开发邮件正文或认证秘密。

## 验收与后续整合

基线检查包括类型、Lint、构建、8 项核心服务测试、3 项浏览器测试和 1 项生产模式测试。核心测试包含新 Node 进程恢复已有会话；数据库审查确认移动 schema 后无 DDL 差异。

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run test:production
```

默认浏览器测试自启独立开发服务，运行前应停止现有 `next dev`，避免同一构建目录的开发锁冲突。需要验证已经运行的本机开发服务时，可执行：

```powershell
npx cross-env PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

显式指定 URL 后不会启动／停止该服务；测试会向其开发数据库增加测试用户和邮件，仅用于本地环境。

整合时复查：用户 ID 关联、服务端身份校验、Cookie 域与路径、同源地址、环境变量、共享数据库和迁移、全局样式与语言提供器。改动公开契约或业务规则时更新本文版本和测试；新增模块不应静默改变本模块行为。
