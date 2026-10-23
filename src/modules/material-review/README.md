# M009 选手正式材料审核 · 1.1.2

## 1.1.2 · 审核时间默认值与总表可见性修正（2026-10-23）

按用户最新确认，**默认跟随活动起止时间，不再要求先配置审核窗口**。未存储策略时返回有效 `mode: "event"`、`enabled: true`、`revision: 0`，直接使用活动发布版本的 startsAt/endsAt；读取不写入虚拟策略。开始包含、结束不包含；草稿改期不影响已发布活动，活动下架仍保留最后发布配置供审核使用。

设置支持三种规则：`event` 跟随活动时间、`unlimited` 不限时、`custom` 自定义时间，均可手动暂停。超级／运营管理员都可切换，修订检查、必填原因、事务鉴权与审计保持。不限时没有日期门槛，活动结束后仍能审核；切回活动规则后立即按当前活动时间判断。自定义启用时必须有有效的未来截止时间。选手修改／重提仍遵守原提交期，审核规则不延长选手提交资格。

PATCH `/api/admin/materials/review-policies/:eventId` 输入 `{revision,mode,enabled,opensAt?,closesAt?,reason}`；日期仅在 custom 模式必填，event/unlimited 存储日期为空，DTO 中 event 日期为即时解析的有效日期。为兼容旧调用，省略 mode 的写入继续按 custom 处理。追加 `0011_cold_boomer.sql`：旧策略明确迁为 custom，保留时间、启停状态、版本和历史，不修改 0000—0010。所有新旧审核写服务使用相同规则，并在实际 SQL 更新时再次校验截止，未配置策略不再触发 REVIEW_UNCONFIGURED。

后台侧栏、首页功能入口及列表标题统一为“材料审核总表”，地址仍为 `/admin/materials`。桌面压缩统计及窗口说明，正式记录首屏可见；赛道、协调、排序收进“更多筛选”，有 URL 条件时自动展开。活动／状态选择立即生效，搜索仍 300ms 防抖。顶部“查看总表”定位并聚焦记录区；手机保持卡片及横排标题。空表明确解释正式提交与草稿的区别，提供查看全部入口，保留表头、筛选、分页、详情返回及滚动恢复。

复核与验证见 [1.1.2 修正记录](../../../docs/M009-1.1.2-VALIDATION.md)。以下 1.1.0 的“未配置只读”及必须单独配置的规则为历史记录，以上述新规则为准。隐私、权限、撤回、协调记录及其他模块边界不变。

## 1.1.0 · 活动审核管理优化（2026-10-23）

`/admin/materials` 为正式材料总表，桌面表格、手机记录卡；保留原详情页。搜索项目名／报名展示名，300ms 防抖；活动、赛道、状态、协调情况、最新／最早及分页记录在 URL，每页 20 项，详情返回恢复条件和位置。列表仅返回所需展示字段，不返回邮箱、联系方式、正式全文、草稿或内部备注。统计不应用单一审核状态，列表数量应用全部条件。

两类有效管理员都可设置、暂停、延期和重新开放单场审核，原因必填；超级管理员同样不能绕过审核关闭。审核期独立于公众活动、报名、提交及发布状态，`opensAt <= serverNow < closesAt`。未配置默认只读，不自动开放旧活动。关闭后正式材料、私有附件及历史继续可读。暂停保留原时间；开启必须有未来截止。列表／详情显示活动时区、完整起止和倒计时，服务端在共同事务及执行更新时检查，旧 M002 受理接口也生效。

通过可撤回为待审核，公开撤回原因必填；清空当前结果／处理信息，但保留正式内容、提交时间和提交版本、草稿及附件。新决定替换当前说明，历史不删除。选手端显示原通过已撤回，能否重提仍遵守原提交窗口。协调标记／内部备注可独立保存，不改变审核结果；重提保留并标明其关联旧版本，管理员主动确认后关联当前版本。内部信息不下发选手，不影响公开项目。

新增 `policy.ts`、`rules.ts`、`schema.ts`；追加 `0010_mixed_cardiac.sql`，新增 material_review_policies 及材料三个增量字段和查询索引，保留 0000—0009。沿用共享写队列、M001 公开身份与 M008 admin:materials；无新增环境变量，不修改 OIDC、活动发布或首页管理。真实迁移须停服备份，保持原列内容及现有附件，不提供重置／自动开窗脚本。

### 服务与接口

- `listMaterials`：`eventId/q/trackId/status/coordination/sort/page`，返回分页 items、statistics、最小活动／赛道选项及窗口、serverNow。全活动赛道使用 `eventId:trackId`；搜索转义 `%/_` 为普通字符。统计／列表在受协调的同一读取事务取得，不逐行查询历史。
- `getMaterial`：新增 reviewPolicy、canDecide/canRevoke/canAnnotate、readOnlyReason、coordinationRequired/coordinationSubmittedRevision、reviewNotice。详情保留报名与正式附件；没有草稿。
- `decideMaterial`：原双修订契约保留，增加共同窗口检查。状态／说明变更、修订与审计原子提交。
- `revokeApproval` → POST `/api/admin/materials/:id/revoke-approval`：`{revision,submittedRevision,reason,internalNote?}`。
- `saveCoordination` → PATCH `/api/admin/materials/:id/coordination`：`{revision,submittedRevision,coordinationRequired,internalNote}`。
- `getReviewPolicy/setReviewPolicy` → GET/PATCH `/api/admin/materials/review-policies/:eventId`：写入 `{revision,enabled,opensAt,closesAt,reason}`，首次修订 0，时间必须带偏移；读取含最近 50 条时间变更历史。
- 401/403 为认证／权限；409 包括 REVISION_CONFLICT、NOT_PENDING、NOT_APPROVED、REVIEW_UNCONFIGURED、REVIEW_NOT_STARTED、REVIEW_PAUSED、REVIEW_CLOSED、REVIEW_DEADLINE_REQUIRED；非法请求 400。写请求同源校验、响应不缓存，冲突／未知结果保留输入并锁写后核对。

审计动作包括 material.approved/rejected、material.approval_revoked、material.coordination_saved、review_policy.changed；保存操作者、活动／对象、前后状态、正式版本及原因。协调保存不冒充最近审核决定。旧备注没有可验证的关联版本时保持空版本，不伪造历史。

验证记录见 [M009 1.1 验收](../../../docs/M009-1.1-VALIDATION.md)。后文 1.0.0 为历史记录，窗口和通过只读等原限制以上述增量规则为准；真实项目投稿／发布、评分、批量操作与生产上线仍不在范围。

## 当前维护摘要（2026-10-10）

- 职责：正式材料审核／附件和业务审计，不读取草稿、不发布项目。
- 公共接口：server.ts/listMaterials、getMaterial、decideMaterial；contracts.ts/http.ts；/api/admin/materials 详情/decision/files；浏览器用共享 admin client，无独立 client.ts。
- 依赖与配置：M001、M008 admin:materials、M002 正式材料／私有附件、共享 DB／写队列及 0006 业务审计；无新变量。
- 验证：material-review.test.ts、event-participation.test.ts；浏览器 playwright.material-review.config.ts 或全量 E2E。服务文件用 `npx tsx --test tests/<文件>`，浏览器文件用 `npx playwright test tests/e2e/<文件>`；完整命令／隔离见 [运维](../../../docs/OPERATIONS.md)。
- 集成限制：双修订校验；原因对本人可见，内部备注仅管理员。驳回原期可重提，通过只读、不延截止。下架后仍可后台审核正式附件；变更审计同事务；不公开项目。

以下原交付记录保留历史语境；当前依赖和行为以上述摘要及最新接入段落为准。实际当前验证见 [仓库验收](../../../docs/REPOSITORY-VALIDATION.md)，原 zip 仅本地留存，源码使用 Git 追溯。

官方入口 `/admin/materials`。有效超级／运营管理员具有 admin:materials；替代原 EVENT_REVIEWER_EMAILS 业务授权，不自动将白名单账号提权。审核现有个人正式材料，不包括独立项目投稿、团队统一提交或项目公开发布。

## 接口与字段

server.ts 导出 listMaterials、getMaterial、decideMaterial。GET `/api/admin/materials?page=1&eventId=…&status=…` 返回分页列表；GET `/api/admin/materials/:id` 返回 `{material}`；POST `/api/admin/materials/:id/decision` 接收 `{revision,submittedRevision,action:'approved'|'rejected',reason,internalNote?}`，返回 `{material}`。驳回原因必填。JSON、Origin 和会话限制沿用后台约定，响应不缓存。

详情包含报名信息、official、正式引用 assets、内部备注和只读 history，不返回草稿。状态投影为 pending／approved／rejected；needs_changes 与 processed rejected 均显示驳回。开放期驳回可补充重提；accepted 仍只读。用户已确认沿用原提交截止，驳回不延长窗口，截止后不能修改／补交。保存草稿与正式资料分离，重提恢复待审核；两修订号校验防止过期审核覆盖。

GET `/api/admin/materials/:id/files/:fileId` 是独立管理员附件接口，校验审核权限及正式引用，活动下架后仍可审阅；公开活动及报名 API 此时 404。内部备注不向选手或公开目录下发，原因向本人显示。清理仍保护全部活动正式／草稿引用。

## 数据、审计与限制

0006_true_garia.sql 追加业务审计，不重置旧用户／材料。操作及前后审核快照、提交修订号、操作者、时间同事务保存；权限每请求及写事务核验。权限审计和材料业务审计分开。

验证：88 项服务通过；44 项浏览器用例经全量 43 项及旧受理用例修正后的 1 项复验通过；类型／Lint／隔离构建、生产保护 2 项及票务禁用 1 项通过。设计见 docs/M009-DESIGN.md，最终记录 docs/M009-VALIDATION.md。源码 deliverables/M009-material-review-v1.0.0.zip，不包含密钥、数据库或用户附件，全部旧包保留。生产登录和最终上线条件另行验收。
