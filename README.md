# 本分支：M003 模拟售票预备模块

不合入 main，不真实收款，仅恢复售票及其依赖，不包含 OIDC。以下核心说明以 main 为基准。模块见 src/modules/ticketing/README.md。

# HACKATHON · 官网核心主线

面向国内外创造者的本机全栈网站：首页、活动展板、报名与个人材料、组队、项目投稿展示、点赞评论及官方后台。当前用于本机开发与验收，未部署公网。演示品牌和初始内容不代表真实活动。

模拟售票 M003、统一登录 M013/M014 保存在独立分支；生产适配 M016 暂缓。功能及 PR 归属以 [分支索引](docs/BRANCHES-AND-PRS.md) 为准。

## 安装与启动

Node 24、npm、Git。执行 `npm ci`；新机器才复制 .env.example 为 .env.local，生成随机 AUTH_SECRET，再运行 `npm run dev`。默认 http://localhost:3000，APP_ORIGIN 必须与浏览器一致。已有环境、数据库、账号和附件不能覆盖。默认 PGlite 本机单进程，无需 Docker。

## 真实本机邮箱

日常官网使用 MAIL_TRANSPORT=smtp、MAIL_LOCAL_SCOPE=website、ENABLE_DEV_MAIL=false，私下配置 QQ SMTP TLS 465。旧账号、管理员、AUTH_SECRET 和数据路径保留。详细参数见 [认证模块](src/modules/auth/README.md)。

`npm run mail:preview` 保留独立 3105 沙箱，使用其自己的数据；`npm run mail:check` 只向自己配置的验收邮箱发测试邮件。production 始终禁用本轮本机投递，不是已完成的公网登录服务。密钥不提交或通过聊天发送。

## 目录

| 目录 | 内容 |
| --- | --- |
| src/app | 页面与 API 适配 |
| src/modules | 在用业务；M010/M011 共用发布核 |
| src/components | 共用导航、语言、布局 |
| src/lib | 数据库连接、写协调器、文件校验和历史表兼容声明 |
| drizzle | 0000—0013 追加迁移，旧 SQL 不修改 |
| public | 公开资产，禁止放私有附件 |
| tests | 核心服务、浏览器、生产保护与模块边界测试 |
| scripts | 迁移、初始化、维护、邮件及安全检查 |
| docs | 当前维护说明、设计和验收 |
| .data | 本机数据库、附件、夹具、日志，不入 Git |

## 验证

依次运行 `npm run check:repository`、`npm run check:security`、`npm run lint`、`npx next typegen`、`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run build`、`npm run test:production`。使用隔离数据，不复用真实服务。NEXT_DIST_DIR 可隔离构建；build 与 start 必须使用同一目录。

[当前状态](docs/PROJECT_STATUS.md) · [模块登记](docs/MODULES.md) · [架构](docs/ARCHITECTURE.md) · [本机接手](docs/HANDOFF.md) · [维护](docs/OPERATIONS.md) · [协作](CONTRIBUTING.md) · [本次验收](docs/CORE-CONSOLIDATION-VALIDATION.md)

## 数据及边界

共享连接和迁移历史保留，首次建库不创建真实用户或管理员。旧票务和外部身份表仅保留兼容声明，不提供对应功能。旧外部身份绑定不自动解除，旧 OIDC 会话不会在主线生效。

私有附件通过授权接口访问。生产数据库、云存储和部署草稿仅在 [M016 分支](https://github.com/aladyaraya/Atox_Web/tree/codex/m016-production-readiness)。本轮不采购、不部署，不复制私人数据到模块分支。
