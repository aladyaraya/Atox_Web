# M012 项目互动

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

幂等点赞／取消、一级纯文字评论、本人删除及管理员隐藏／恢复。

server.ts 的 getInteractionStats/setLike/listComments/addComment/deleteComment/listManagedComments/moderateComment；/api/projects/:id/like、comments 及 /api/admin/project-comments。

## 依赖和数据

依赖 M001 身份及公开昵称、M015 可见性、M008 admin:project-comments。

## 配置及集成限制

公开作者只有昵称；评论 1—1000 字，20 条分页，每分钟 3 条／小时 20 条，幂等重试不重复扣额。改名反映历史评论；删除不恢复，隐藏需原因并与审计原子保存。点赞设置状态而非盲切换，无回复、收藏、评分。

## 验证

project-interaction.test.ts；浏览器 project-interaction.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
