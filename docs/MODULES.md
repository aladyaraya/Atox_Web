# 本分支：M003 模拟售票预备模块

不合入 main，不真实收款，仅恢复售票及其依赖，不包含 OIDC。以下核心说明以 main 为基准。模块见 src/modules/ticketing/README.md。

# 当前模块登记

范围由本表及各模块 README 共同定义。分支／PR 管理见 BRANCHES-AND-PRS.md，实际验收见 CORE-CONSOLIDATION-VALIDATION.md。历史交付不等于当前主线启用或公网发布。

| 编号 | 职责 | 目录／维护接口 |
| --- | --- | --- |
| M001 | 邮箱验证码、会话、昵称、真实本机投递 | auth；其他模块只通过其 server/client/contracts 接入 |
| M002 | 多活动个人报名、草稿、正式材料、私有附件 | event-participation；resolveEvent/resolveFiles 按活动绑定 |
| M004 | 公开活动展板和筛选 | event-board；getBoard/getEventConfig 读取发布源 |
| M005 | 长页首页、双语入口和页脚 | homepage；组件及结构化发布内容 |
| M006 | 项目搜索、分类、活动筛选、详情及排序 | project-board；getProjects/getProject |
| M007 | 组队、招募和申请 | participant-center；resolveCenter 绑定活动 |
| M008 | 本地管理员、权限及审计 | admin；server.ts、contracts.ts |
| M009 | 正式材料审核、撤回通过、协调、审核窗口 | material-review；server.ts |
| M010/M011 | 活动和首页的草稿、预览、发布、下架 | content-management；两模块共用发布核 |
| M012 | 点赞、一级评论及管理 | project-interaction；server/client/contracts |
| M015 | 真实项目投稿、送审、公开授权、发布和下架 | project-submission；server/client/contracts |

## 独立预备

M003 在 codex/module-m003-ticketing；M013/M014 在 codex/module-m013-m014-oidc。运行实现、路由、SDK、配置、实验和专项测试不属于 main。M016 在 codex/m016-production-readiness 暂缓。

## 数据与集成边界

M001 是唯一认证边界；用户 UUID 不改，管理员角色不由邮件或外部身份自动产生。主线 PGlite 单进程，共享连接和写队列；保留 0000—0013 全部历史，不删旧表。legacy schema 只保存历史元数据及防绕过查询，不实现预备模块。

业务路由调用异步发布源，写入重查权限、时间、修订和附件归属。M002 私有材料不自动公开，M015 审核与发布分开，组队不共享个人材料。公开 DTO 不包含邮箱、私有 PDF 或内部备注。

当前不提供真实收款、团队统一交稿、收藏回复评分、飞书同步和公网部署。各模块 README 记录现行接口／配置／测试，不把旧开发轨迹混入当前状态。
