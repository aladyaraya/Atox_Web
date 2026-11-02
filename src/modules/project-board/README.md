# M006 项目展区与详情

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

公开项目列表、搜索分类／活动筛选、分页、详情、媒体和三种排序。

server.ts 的 getProjects/getProject；GET /api/projects、/api/projects/:id。详情 /projects/:id；return-to 只接受本站展区地址。

## 依赖和数据

项目来源由 M015 公开版本提供，互动统计来自 M012，关联活动取 M004。

## 配置及集成限制

已接真实投稿后的发布版本，不是投稿占位页。每页九项，最新／最早／点赞排序后分页，条件存 URL。匿名可浏览，未知／下架或关联活动下架项目不可公开。无假点赞排名，不泄露草稿、邮箱或 PDF。

## 验证

project-board.test.ts；浏览器 project-board.spec.ts、project-interaction.spec.ts、project-submission.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
