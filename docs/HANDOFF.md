# 开发交接与运行说明

更新：2026-10-23。适用于合入 main 的 M001—M015 本地开发基线；源码托管、CI 验证与生产上线分别管理。

## 先读什么

[PROJECT_STATUS](PROJECT_STATUS.md) 顶部为当前状态，其后旧记录只代表当时版本；[MODULES](MODULES.md) 为模块登记，各模块 README 是实际接口与业务边界。环境、备份与排错详见 [OPERATIONS](OPERATIONS.md)，提交约定见 [CONTRIBUTING](../CONTRIBUTING.md)。

当前已包括个人报名与材料、组队、材料审核、活动与首页发布、真实项目投稿／审核／发布、项目详情／点赞／评论。M003 仅模拟支付；M013/M014 为隔离 Logto 实验及开发接入。真实收款、正式邮箱、团队统一投稿、回复／收藏、最终部署整合另行开发。

## 新机器首次运行

使用 Git、Node 24（见 `.nvmrc`）和 npm。普通网站无需 Docker，Logto 实验才需要 Docker／Compose。

```powershell
git clone https://github.com/aladyaraya/Atox_Web.git
Set-Location Atox_Web
git switch main
npm ci
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

将生成值填入本机 `.env.local` 的 `AUTH_SECRET`，保持 `APP_ORIGIN=http://localhost:3000`、`ENABLE_DEV_MAIL=true`，然后执行 `npm run dev`。访问 <http://localhost:3000>；邮箱验证码到 `/dev/mail` 查看，邮件不会实际发送。若启用模拟购票，设置 `ENABLE_TICKETING_PREVIEW=true`，另生成独立的 `TICKETING_WEBHOOK_SECRET`（至少 32 字符）并重启。OIDC 默认关闭，不能只打开开关就代替正式邮箱登录。

上述复制环境文件仅适用于新机器。已有工作目录保留原环境、密钥、`.data` 和附件；不要覆盖环境文件或复制他人的数据库。首次连接自动依次应用 `drizzle/0000`—`0012` 的追加迁移并导入原 12 个演示项目，不创建真实用户或管理员。

浏览器使用 `localhost` 时不要混用 `127.0.0.1`；同源校验包含主机和端口。更换访问地址须同步 `APP_ORIGIN` 并重启。

## 初始化管理员与常用入口

先通过邮箱完成自己账号的注册，停止占用目标 `DB_PATH` 的网站，再执行：

```powershell
npm run admin:bootstrap -- --email registered@example.com
npm run dev
```

邮箱须替换为已经注册的本人账号；不存在账号会拒绝，一次性初始化不能用于重新提权或恢复禁用。后续超级管理员在后台授权运营人员；普通用户无自助提权入口。新机器不会继承开发者现有的管理员。

| 地址 | 用途与权限 |
| --- | --- |
| `/`、`/events`、`/projects` | 公开官网、活动与公开项目 |
| `/account`、`/account/projects` | 已登录用户账户和本人项目 |
| `/projects/submit` | 登录后创建真实项目草稿 |
| `/events/:eventId/register`、`/materials` 子页 | 对应活动的报名与个人材料 |
| `/admin` | 有效超级／运营管理员入口 |
| `/admin/materials` | 选手正式材料审核总表，草稿不在表中 |
| `/admin/projects` | 用户送审项目及演示项目管理总表 |
| `/admin/events` | 活动草稿、授权预览、发布和下架 |
| `/admin/content/homepage` | 官网正文草稿、预览与发布 |
| `/admin/administrators`、`/admin/audit` | 仅超级管理员授权及权限审计 |
| `/preview/ticketing/demo`、`/orders` 子页 | 开发开关开启时的模拟购票与本人订单 |

材料审核默认跟随活动开始／结束，可由两类管理员改为不限时、自定义或暂停；原选手提交期限仍有效。项目审核不限时，不使用材料审核窗口。项目批准与公开发布是两步；作者新稿不覆盖公开旧版，PDF 仅供审核。M002 材料不会自动变成公开项目。演示项目无虚构投稿人，只允许预览及上下架。

## 已有数据的升级与维护

同一 PGlite 目录只允许一个进程。不要在网站运行时启动同库迁移、初始化或清理命令。

1. 核对代码版本、目标 `DB_PATH`、`UPLOAD_PATH`，停止对应网站及其子进程。
2. 将完整数据库与全部私有附件复制到仓库外受控位置，记录时间点和提交号；配置与密钥另行受控保存。先验证备份可恢复，再拉取代码或执行迁移。
3. `git pull --ff-only origin main`，`npm ci`，`npm run db:migrate`。保留已应用迁移和用户；不得删库、改历史 SQL 或重新 bootstrap 来处理故障。
4. `npm run dev`，检查旧账号登录、材料／附件、后台授权、公开项目与订单。失败先停服定位；回退须恢复同一时间点的代码、数据库和附件，不能仅退代码后继续写新结构。

按需离线运行 `npm run events:cleanup-files`、`npm run projects:cleanup-files`、`npm run ticketing:maintain`。前两者仅清理超过 24 小时的孤立文件，项目清理保护草稿、送审历史及公开引用；票务维护需开发预览开启，未知交易保持核对，不删除财务记录。不要对同库并行执行维护。

## 验证与测试隔离

以下为验收 shell，独立于日常 3000 网站；不要把真实数据路径传给测试。构建和生产测试必须使用同一 `NEXT_DIST_DIR`。测试顺序运行，不复用已有 3100／3101／3102 服务。

```powershell
$env:NEXT_DIST_DIR = '.next-handoff'
$env:DB_PATH = '.data/handoff-build/db'
$env:UPLOAD_PATH = '.data/handoff-build/uploads'
$env:APP_ORIGIN = 'http://127.0.0.1:3101'
$env:ENABLE_DEV_MAIL = 'false'
$env:ENABLE_TICKETING_PREVIEW = 'false'
npm run lint
npx next typegen
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run test:ticketing-disabled
npm run build
npm run test:production
```

执行完关闭此验收 shell，避免临时变量影响日常网站。项目投稿专项可单独执行 `npx playwright test --config=playwright.project-submission.config.ts`，使用 3100 独立夹具。Next 会生成类型引用和自动调整 tsconfig；提交前核对 diff，勿将隔离构建目录写进维护基线。新 checkout 应先运行 typegen，再做类型检查。

M015 本地验收记录为服务 137 项、全量浏览器 59 项、最终投稿专项 4 项、生产保护 2 项、票务关闭 1 项，类型／Lint／隔离构建通过；详见 [M015 验收](M015-VALIDATION.md)。这些是本地记录，实际合并时以对应 GitHub Actions 运行结果为准。真实 Logto 协议另见 M013/M014 专用 CI；本机没有 Docker 时不要声称完成了容器流程。

## GitHub 与分支交接

`main` 是统一开发基线；功能分支合并时保留原模块提交历史，不强推。新任务从最新 main 建 `codex/<task>` 或协作约定的功能分支。提交前暂存明确的源码路径，执行 `npm run check:repository` 检查 Git index；PR 通过 CI 后再合并，确认已进入 main 才清理旧分支。见 [本次合并记录](GITHUB-HANDOFF-2026-10-23.md)。

源码、锁文件、追加迁移及文档纳入 Git；`.env.local`、`.data`、私有附件、测试 trace、原 `deliverables` 不上传。保留本地产品资料，不用全目录打包代替源码交接。仓库当前无生产部署工作流；分支保护是否启用须查看 GitHub 实际设置，不能把文档建议当作已启用规则。

## 部署限制

`npm run build`／`npm start` 仅用于当前 Node 单进程运行与生产模式验证，不能作为 GitHub Pages 静态站。生产模式开发邮箱和模拟购票禁用，现有 OTP 返回 `MAIL_DISABLED`，OIDC 开发接入也关闭。正式邮箱、域名／HTTPS、可信代理、生产 PostgreSQL／存储／备份及真实支付另行验收。

现有 Next.js 依赖的安全公告仍列为上线阻塞项，本次 GitHub 整理不升级依赖，也不将 CI 通过视为安全审计或生产上线。若构建工具因安全公告停止，应先查看实际诊断，不能删除安全检查或将异常当作已通过。
