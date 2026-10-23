# M015 · 用户项目投稿、审核与发布管理

版本：1.0.0，本地开发基线。所有者投稿与官方审核分开，审核与公开发布分开；不提供官方新建、代改作者内容、团队统一投稿、项目转移或真实收款。

## 页面与边界

- `/projects/submit`：登录返回后幂等创建项目草稿；请求键按账号暂存在 sessionStorage，结果不确定时重试同一键。
- `/account/projects`、`/[projectId]`：本人列表、编辑、文件上传、草稿、送审、驳回说明及主动下架。账户页有“我的项目”入口。
- `/admin/projects`、`/[projectId]`、`/[projectId]/preview`：项目总表、只读正式材料、审核、预览、发布／下架及历史。首页和侧栏有“项目管理”。有效超级／运营管理员均有 `admin:projects`，每请求与写事务重新校验。
- 总表每页 20 条，服务端搜索中英文名称和创作者，来源／分类／活动／审核／发布状态取交集，按更新时间倒序、同值 ID 升序。条件和页码保存到 URL，搜索 300ms 防抖；跳转详情前取消待执行搜索，避免把导航拉回列表。移动端记录卡与定位入口保留。
- 项目所属活动须本人已报名，上传／保存／重提使用当前已发布活动的 submissionOpensAt/submissionClosesAt，开始包含、截止不包含；首次正式送审后固定活动关联。不能改成独立项目绕过当前活动关闭。独立项目不限时，官方项目审核不限时，不调用 M009 审核窗口。
- M002 参赛材料、草稿及附件不导入本模块；只复用报名资格和活动发布源。认证只通过 M001 公开身份／契约及已文档化的纯服务能力接入，不修改会话或账号。

## 投稿内容与状态

ProjectInput 包含 language、name（100）、tagline（200）、description（20000）、translation、creator（100）、category、eventId、tags（最多 8 个，每个 30）、coverId、screenshotIds（最多 6）、documentId、demoUrl/videoUrl/codeUrl、original/usageAuthorized/publicConsent。长度按 JS 字符串校验，字段为纯文本；链接仅接受无嵌入凭证的 HTTPS，不嵌入外站页面。中文或英文原文必填，另一语言逐字段选填，缺译回退原文，不自动翻译。创作者默认公开昵称，未设置则由作者填写，不用邮箱兜底。

草稿允许不完整，正式送审须有名称、简介、说明、创作者、分类、封面及三项声明。PDF 选填且仅供审核；不要求额外实名认证。

- 草稿独立保存，`draftRevision` 防止旧页面覆盖；保存不改变审核或公开版本。
- 送审生成不可变版本，`submittedRevision` 递增，当前审核回到 pending，清空旧当前反馈；旧审核记录保留。审核动作同时检查项目 revision 和送审版本，不能处理已被替换版本。
- 审核为 pending/approved/rejected，驳回原因必填并对作者可见，内部备注仅管理员可见。管理员不编辑正文、不查询未提交草稿正文，不把草稿列进管理总表。
- 发布为 unpublished/published/withdrawn；只有当前 approved 版本可发布。修改、保存及重提期间保留线上 live，发布新版才替换；publishedAt 保存首次发布时间，演示项目原发布时间保留。
- 作者主动下架撤销公开授权、清除草稿里的 publicConsent 并递增草稿修订。恢复必须重新确认授权、送审、批准及发布。管理员不能凭旧批准恢复；管理员自行下架则可重新发布原批准版本，前提是作者授权仍有效。
- 关联活动下架隐藏公开项目、媒体及互动写入，但保留管理端读取与历史。活动恢复后仍按项目自身发布状态判断，不能复活已自行下架项目。

## 数据与集成接口

追加 `0012_spicy_titania.sql`，新增 submitted_projects、project_submission_versions、project_submission_assets。演示项目导入 source=demo、owner 为空、审核不适用，保留 12 个原 ID、原公开内容及互动；不伪造投稿人或审计。送审版本数据库触发器禁止 UPDATE/DELETE。旧迁移、users 和全部既有表不重置。

server.ts 是 Next 服务端入口，service.ts 是纯服务／测试入口；contracts.ts 为浏览器安全类型，client.ts 为受控请求，store.ts 提供统一公开读取与元数据投影。读公开项目不回退静态注册表；M006 展板／详情、M012 点赞评论及评论管理都使用统一来源。公开内容采用字段白名单，不携带作者内部 ID、邮箱、草稿、PDF、审核意见或内部备注。

| 方法与地址                               | 用途／输入                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET /api/account/projects?page=1         | 本人分页摘要及已报名公开活动选项                                                          |
| POST /api/account/projects               | `{requestId: UUID}`，账号内幂等创建，返回 `{id}`                                          |
| GET /api/account/projects/:id            | `{project, options}`，本人草稿、当前正式材料及反馈                                        |
| PUT /api/account/projects/:id/draft      | `{draftRevision,payload}` → `{project}`                                                   |
| POST /api/account/projects/:id/submit    | `{draftRevision,revision}` → `{project}`                                                  |
| POST /api/account/projects/:id/withdraw  | `{revision,reason}` → `{project}`                                                         |
| POST /api/account/projects/:id/files     | multipart 单个 file＋purpose，返回 AssetDto                                               |
| GET /api/project-files/:fileId           | 本人、正式版本审核权限或当前公开引用鉴权                                                  |
| GET /api/admin/projects                  | q/source/eventId/category/reviewState/publicationState/page；返回摘要、分页和最小活动选项 |
| GET /api/admin/projects/:id              | `{project}`；正式内容、附件、预览、live 及最近 100 条操作历史                             |
| POST /api/admin/projects/:id/decision    | `{revision,submittedRevision,action:approved/rejected,reason,internalNote?}`              |
| POST /api/admin/projects/:id/publication | `{revision,submittedRevision,action:publish/withdraw,reason?}`，下架原因必填              |

eventId 筛选值 independent 表示独立项目。写接口使用同源与会话验证；JSON 复用后台 64KiB 限制，multipart 流式上限 21MiB。响应 no-store。401 未登录、403 越权、404 不存在／未公开、400 输入错误、409 修订／状态冲突；文件对无权者使用 404。

所有写操作使用共享 PGlite 写协调器和事务。权限、资格、修订、附件归属在事务复查；上传元数据、保存及送审更新在实际 SQL 中用 clock_timestamp 校验截止。管理员操作与只追加业务审计原子提交，记录 actor/time/resource/版本及前后审核、公开、授权状态。草稿审计只记修订，不复制私人正文。冲突或未知结果保留浏览器输入、锁写并要求读取最新状态，不自动重提。

## 文件与运行配置

复用 UPLOAD_PATH，实际目录为其下 `project-submissions/`，禁止位于 public。随机文件名，元数据绑定 owner＋project＋用途；引用其他项目文件即使同账号也拒绝。图片 PNG/JPEG/WebP、每张 5MiB，解码重编码并移除元信息；PDF 20MiB，检查真实内容、有效页面且拒绝加密。纯文件校验抽取为共享 upload-content.ts，M002 保留原错误及规则。

当前公开版本引用的图片才允许匿名读取；PDF 永不公开。作者可读自己的附件；管理员只能读取正式版本历史引用，不能读取未提交草稿附件。下架后匿名图片读取失效，下载响应 private/no-store、nosniff；PDF attachment 下载。

`npm run projects:cleanup-files`：**先停止使用同一 PGlite 目录的网站**，默认清理超过 24 小时且无引用的文件及孤立磁盘文件。保护全部草稿、正式历史及公开版本，不新增常驻任务。无新增环境变量；生产邮箱／OIDC 上线条件仍按 M001/M014 处理。

验证与真实迁移保护见 [M015 验收](../../../docs/M015-VALIDATION.md)。源码、迁移和锁文件沿用 Git 维护，密钥、运行数据、私人附件、截图和 trace 不入库。本地开发基线不等同生产部署或最终全站整合。
