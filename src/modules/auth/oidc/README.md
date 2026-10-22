# M014 · 官网 Logto 与原账号安全映射

1.0.0，本地开发接入，属于 M001 内部。生产始终关闭；没有正式邮件、批量迁移、第三方登录或全产品会话撤销。

## 职责与集成边界

业务仍经 `@/modules/auth/server` 的 getCurrentUser 使用原 AuthUser／users.id；不导入 SDK 或把 sub 当外键。本目录 server.ts 为 M001 框架子入口，contracts.ts／client.ts 为安全浏览器契约。provider.ts 固定官方 `@logto/node@4.0.1`，校验授权码、PKCE S256、state、签名／issuer／audience／到期，额外绑定 nonce。自定义加密服务端存储沿用 M001 不透明会话。acceptVerifiedIdentity 仅供已验证适配器内部使用，不是 HTTP 身份输入／业务公共接口。

0009 仅新增 external_identities、oidc_flows、identity_recovery_approvals、oidc_session_contexts、identity_audit。共享连接／写队列复用，网络在写锁外；原模型、外键和迁移不改。M008 继续按本地 ID 授权，不使用 Logto roles。

## 本地启动

无需域名。需要 Node 24，实际 Logto 另需 Docker Desktop／Compose；本轮不安装系统组件。地址统一使用 127.0.0.1。

```sh
# labs/logto-oidc 内
npm ci
npm run init
npm run up
npm run provision
# 返回仓库根目录
npm ci
npm run oidc:preview
```

网站 http://127.0.0.1:3104，测试邮箱 http://127.0.0.1:13325，Logto http://127.0.0.1:3301。点击“使用 Logto 登录／注册”，在中央页面创建账号并从 Mailpit 取码。第三客户端回调精确为 `http://127.0.0.1:3104/api/auth/oidc/callback`，退出返回 `/login`；A/B 保持独立。

启动器仅读取 lab 忽略的 clients.json，随机密钥保存 `.data/oidc-sandbox/local/secrets.json`，账号／附件使用其下独立目录。不改 .env.local、不打开原业务 DB、不复制现有账号。Logto 未就绪则停止提示。原网站 3000 保留既有开发登录。不要用 down -v 日常停止实验。

## 配置、会话和回退

ENABLE_LOGTO_LOGIN=true 仅 development 生效，production 始终 404。LOGTO_ENDPOINT、准确 LOGTO_ISSUER、APP_ORIGIN、LOGTO_APP_ID、LOGTO_APP_SECRET 必填；OIDC_ENCRYPTION_SECRET 至少 32 字符且不同于 AUTH_SECRET，不加 NEXT_PUBLIC。根 .env.example 安全默认关闭。

OIDC_EMAIL_TRUST=local-sandbox 必须是回环网站／服务且 DB_PATH 位于 `.data/oidc-sandbox/`；测试邮件不能对原 DB 建正式映射。verified-email 需要维护者独立核验真实邮件及上游控制，并显式 OIDC_VERIFIED_EMAIL_ACK=trusted-provider-and-real-email-reviewed；仍仅开发可用，不表示生产审批完成。信任等级不自动升级。

OIDC 会话最多 15 分钟或 ID token 到期，绝对过期、不续期；随机令牌摘要落库，HttpOnly／Lax。不长期保存 access／refresh token，ID token 仅 AES-256-GCM 加密供退出。临时 SDK／身份载荷用途隔离加密，流程 10 分钟。完成清理临时载荷；加密回执允许原流程 Cookie 在响应丢失时恢复同一个未撤销会话，不重复建会话或复活退出状态。

关开关或改变 issuer／客户端／信任／站点／OIDC_SESSION_VERSION，使 M001 立即拒绝 OIDC 会话，未关联邮箱会话仍按原 7 天规则。关联成功撤销目标账号旧会话。已关联用户的开发 OTP 永久拒绝 OIDC_REQUIRED，关开关也不恢复绕过。回退保留账号、映射、审计，恢复正确配置后重验；没有可信备用凭据时不自助解绑。

## 旧账号归属

准确 issuer＋sub 命中才使用原用户。新身份仅在 verified email 不冲突时创建本地用户；同邮箱进入 needs_link，不发本站登录。开发会话只能发起申请，不能证明旧账号所有权。

重新验证使用 prompt=login、max_age=0 和新鲜 auth_time，固定目标 UUID／subject 后 awaiting_approval。维护者必须独立核验原账号可信资料或受控业务关系；开发邮箱、验证码、开发会话都不是证据。涉及管理员还需按组织流程复核原权限所有者；无依据不批准。测试的合成证据不用于真实恢复。

停止同 DB 网站，显式提供正确 OIDC 环境后执行（CLI 不加载原 .env.local）：

```sh
npm run oidc:approve-recovery -- --request <流程UUID> --user <经核验原用户UUID> --case <工单引用> --evidence <受控证据引用> --acknowledge-reviewed-evidence
```

维护者在停服受控数据库核对 flow.target_user_id 与申请，不能按邮箱猜 ID。仅记证据引用和操作系统维护者身份，不把证据正文／用户数据提交 Git。批准一次性 5 分钟，不直接建映射。重启网站，原浏览器刷新并明确确认，事务重查请求／身份／当前账号／批准／唯一约束，原子绑定、消费批准、撤销旧会话、建立新会话、记审计。10 分钟超时重新申请。

唯一 (issuer,subject) 与 (userId,issuer)，不 upsert 重指向、不合并用户数据、不提权。旧邮箱不随上游变化自动覆盖。

## 页面与 HTTP

`/account/security` 为登录后安全页，`/auth/oidc/complete` 为关联说明。全部开发显式开启、Node runtime、no-store；除回调外浏览器写请求校验同源。

| 接口 | 行为 |
| --- | --- |
| POST /api/auth/oidc/start | {purpose:login或link,next?}；授权 URL＋HttpOnly 流程 Cookie，next 仅安全站内 |
| GET /api/auth/oidc/callback | 仅 SDK 验证身份，成功发 M001 Cookie，否则安全错误／关联页 |
| GET /api/auth/oidc/pending | 当前流程编号／状态／批准／有效期，无邮箱、sub、目标 ID 或 token |
| POST /api/auth/oidc/confirm | {}；明确确认或恢复回执，仅返回站内 returnTo |
| POST /api/auth/oidc/cancel | {}；取消流程，不修改原用户 |
| GET /api/account/identity | 本人关联／会话方式及中央退出 CSRF，不含 SDK token |
| POST /api/auth/oidc/logout | 原生同源表单＋会话 CSRF，先撤销本站再请求中央退出；失败明确说明 |

原 /api/auth/logout 只退出本站，同时取消当前浏览器流程。中央退出不等于退出所有产品，其他会话可能继续有效。中央禁用账号后本站有效会话最多仍可用 15 分钟，未实现 back-channel 或全局即时撤销。

## 验证与维护

`npx tsx --test tests/oidc.test.ts`；启动并 provision 独立 lab 后 `npm run test:oidc-website`；全量 lint／typecheck／test／构建和原浏览器回归。私有测试控制器仅在 tests 下、随机口令保护，负责停 Next→批准→关闭 DB→重启，无应用审批 API。不同时开两个进程访问同一 PGlite，不上传邮件／密钥／trace／DB。

认证维护者负责 provider／证据批准／密钥；数据库维护者负责停服备份和追加迁移；业务维护者检查原授权。SDK／Logto 升级重跑真实协议。结果及生产缺口见 [验收](../../../../docs/M014-VALIDATION.md)。
