# 本分支认证增量：OIDC

M001 保留主线真实本机邮件用途和 UUID。本分支恢复 oidc 适配和独立证据关联，不按同邮箱自动合并、不授予管理员。见 oidc/README.md 及根 labs/logto-oidc/README.md，不复制主站数据和环境到实验。

# M001 邮箱认证与公开昵称

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

邮箱验证码注册／登录、会话查询／退出、统一昵称和真实本机投递。

server.ts 暴露 getCurrentUser、sendCode、verifyCode、revokeSession、getUserByToken、findRegisteredUserByEmail、公开资料方法；client.ts 和 contracts.ts 是浏览器边界。POST /api/auth/send-code、verify-code、logout，GET /api/auth/me，GET/PUT /api/account/profile。

## 依赖和数据

拥有用户、验证码挑战、会话、发送记录、开发邮件及昵称。业务用本地 users.id，角色由 M008 管理。验证码随机六位、10 分钟、每条最多 5 次；重发 60 秒、每邮箱每小时 5 次、每来源每小时 20 次。消费和会话创建原子，原文只允许开发邮箱；会话摘要、HttpOnly、SameSite=Lax 保留。

## 配置及集成限制

默认 MAIL_TRANSPORT=dev、ENABLE_DEV_MAIL=true。日常官网真实发信：MAIL_TRANSPORT=smtp、MAIL_LOCAL_SCOPE=website、ENABLE_DEV_MAIL=false，DB_PATH 位于 MAIL_WEBSITE_DATA_ROOT（默认本工作树 .data）内；仅本机 development、QQ SMTP TLS 465、SMTP_FROM=SMTP_USER。website 可向表单的单个有效邮箱发信，沿用服务端限流。SMTP_USER/SMTP_FROM/SMTP_PASSWORD 私下填写。跨工作树复用原库时显式设置私有数据根及绝对 DB_PATH/UPLOAD_PATH，保留原 AUTH_SECRET。sandbox 为默认用途，限定 .data/mail-test，使用 MAIL_TEST_RECIPIENT 或显式 MAIL_TEST_ALLOW_ANY_RECIPIENT；mail:preview 强制 sandbox 在 3105 运行。失败作废本次挑战、保留限额，不自动重发或回退开发邮件；SMTP 模式 dev/mail 404。production 禁用本机邮件。历史外部身份仅保留防绕过查询，旧 OIDC 会话拒绝，绑定不自动解除；没有 Logto SDK／入口。

## 验证

auth.test.ts、smtp-auth.test.ts、return-path.test.ts、core-identity-compatibility.test.ts；浏览器 login.spec.ts，生产 auth.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
