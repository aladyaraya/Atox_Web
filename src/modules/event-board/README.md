# M004 活动展板

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

公开活动目录、搜索、年份及阶段筛选、推荐和详情入口。

server.ts 的 getBoard/getEventConfig，GET /api/events 和 /api/events/:eventId；rules.ts 与 contracts.ts 为规则及类型。

## 依赖和数据

读取 M010 已发布活动，M002/M007 按同一活动配置运行。

## 配置及集成限制

活动阶段与报名／提交期限分别判断；结束时刻即结束，时间按活动时区。筛选条件存 URL，未知／下架活动 404；不因进行中推断可报名。配置及实际字段以 contracts 和内容发布核为准。

## 验证

event-board.test.ts、event-board-cards.test.ts；浏览器 event-board.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
