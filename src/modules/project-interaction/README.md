# M012 · 项目详情与互动

版本：1.0.0，本地开发基线（2026-10-22）。M006 1.1.0 负责展板与详情读取，本模块负责真实持久化点赞、一级评论与管理员处理。内容仍为 12 个原创演示项目，不代表真实产品；不接真实投稿、报名材料、回复、评论编辑、图片评论、收藏或生产收款。

## 页面和依赖

- /projects 卡片打开 /projects/[projectId]，不再使用预览弹层；详情包含双语长说明、原创媒体、放大图、活动关联与互动。返回地址只允许项目展区，规范化后保留筛选／排序／分页。
- /account 增加统一公开昵称；首次评论也可设置。昵称 2—30 Unicode 码点，trim、拒绝控制字符，允许重名；修改后历史评论读取最新昵称。点赞和原登录不要求昵称。资料修订冲突不覆盖输入。
- /admin/project-comments 提供全项目、状态、分页与处理弹窗；隐藏理由必填，恢复不能作用于作者已删除内容。冲突或网络未知锁定写入，确认读取最新状态后继续。
- 身份取自 M001 server.ts；资料由 M001 profile.ts 拥有。授权为 M008 admin:project-comments，有效超级／运营管理员均具备。复用 M010 发布源和共享写协调器，旧角色／会话继续有效。没有新环境变量。

## 公共入口和数据

server.ts 导出 getInteractionStats、setLike、listComments、addComment、deleteComment、listManagedComments、moderateComment；纯服务和测试从 service.ts 使用，不引入 Next.js Cookie。浏览器使用 client.ts/interactionRequest 和 contracts.ts；服务端秘密不进入浏览器。详情读取和内容配置由 project-board 提供。

追加 0008_familiar_power_man.sql：account_profiles 归 M001；project_likes、project_comments 归 M012。likes 的 projectId/userId 联合唯一；评论 userId/requestId 唯一，保存请求正文摘要供幂等核对。项目 ID 为静态注册表稳定文本 ID，未来不得改名／复用；写入事务验证项目及所属活动仍公开。现阶段没有持久化项目主表，不伪造其外键。

只修改目标模块表；用户、会话、业务资料、历史迁移不重置。同目录 PGlite 网站与 CLI 互斥；完整事务复用 serializeDatabaseWrite。匿名可读计数／公开评论，写操作验证当前会话、Origin、输入、所有者或角色。

## API

响应均 no-store，Node runtime；互动／管理 JSON 使用现有 64 KiB 上限，昵称沿用认证的 4 KiB 上限，修改均检查同源。未登录 401、越权 403、不存在／不公开 404、输入 400、幂等或修订冲突 409、限流 429（附 Retry-After）。

| 方法与地址 | 契约 |
| --- | --- |
| GET /api/projects | 原筛选及 page，增加 sort=newest/oldest/likes；卡片 stats 为 likeCount/commentCount/likedByMe |
| GET /api/projects/:id | {project,details}，详细介绍、媒体与可选 HTTPS 链接；没有真实地址时不展示 |
| PUT /api/projects/:id/like | {liked:boolean} → stats；设置目标状态，重试幂等 |
| GET /api/projects/:id/comments?page=1 | {items,total,page,pageSize,totalPages}，最新优先，每页 20 |
| POST /api/projects/:id/comments | {body,requestId:UUID} → {commentId,status}；相同键相同规范化内容返回原结果，不同内容／项目冲突 |
| DELETE /api/projects/:id/comments/:commentId | 仅本人，重复删除成功；不再返回正文 |
| GET/PUT /api/account/profile | 本人 {nickname,revision}；PUT {nickname,revision}，首次 revision=0 |
| GET /api/admin/project-comments | page/projectId/status 筛选；额外 commentId 仅供授权处理结果核对 |
| POST /api/admin/project-comments/:id/moderation | {revision,action:hide/restore,reason?} → {ok:true} |

公开评论只包含 id、body、nickname、createdAt、isMine，不返回作者内部 ID、邮箱、正文摘要、幂等键、隐藏原因或权限记录。昵称通过认证模块提供的服务端公开资料投影批量读取，不直接修改认证数据。

## 并发、隐私和故障

- 所有点赞从零开始，真实操作才计数。排序对完整筛选结果进行后才分页；点赞最多同值按发布降序及 ID，时间默认最新，也可最早；未知 sort 回退 newest。点击点赞只更新当前卡片，不自动重排。
- 评论 trim 后 1—1000 字符，按纯文字转义；最新优先、同时间按评论 ID 降序。每账号 3 条／分钟、20 条／小时；被隐藏或删除记录仍计入限额，同请求重试不计新发送。
- 浏览器将未确认评论及原 UUID 保存到按账号／项目隔离的 sessionStorage；没有可靠暂存时不发送。网络未知不允许修改后盲目重发，刷新后核对仍使用原请求；首次请求明确失败可解除锁定，未知请求后续核对失败仍保留原 UUID，避免登录过期后重复发表。登录返回不会自动执行操作。
- 作者删除将正文置空，保留摘要和发送时间用于幂等／限流，不可恢复。隐藏不向公众返回正文、不计公开数量；管理员恢复后重新计数。活动下架隐藏公开读取与写入，历史互动保留，后台仍可管理。
- 隐藏／恢复在事务内重新核验角色、状态和修订；与 business_audit_logs 原子保存操作者、状态前后值及原因，不在审计复制评论正文。作者删除后后台也不返回正文，不能恢复。

## 验证与交接

npm run typecheck、npm run lint、npm test；浏览器 npx playwright test tests/e2e/project-board.spec.ts tests/e2e/project-interaction.spec.ts；全量 npm run test:e2e；构建后 test:production，另跑 test:ticketing-disabled。使用原隔离 fixture 服务器，禁止在实际用户 DB 上跑测试。

服务测试覆盖去重、并发、限流、删除、昵称变更、撤权、审计回滚、下架及重开连接；浏览器覆盖真实登录、公开资料、完整管理闭环、未知结果恢复、昵称／审核修订冲突、双语、媒体、手机与筛选排序。

当前验收见 [M012 验收](../../../docs/M012-VALIDATION.md)。后续真实投稿发布需要单独定义项目主表、公开同意和媒体权限，不能将 M002 正式材料直接挂入这里。M003 仍是独立模拟。生产验证码登录仍禁用，不将本模块交付视为生产上线。

源码归档由本次审查后的 Git commit 生成，路径 deliverables/M012-project-interaction-v1.0.0.zip，仅本地保留。归档不含真实环境、用户数据、上传附件、测试凭据、日志或构建产物，所有旧模块归档保留。
