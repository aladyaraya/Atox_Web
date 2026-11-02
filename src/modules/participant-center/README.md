# M007 选手中心和组队

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

活动任务导航、招募、建队、申请、审批、移交及成员管理。

server.ts 的 resolveCenter 按活动绑定；GET teams、GET/POST center 位于 /api/events/:eventId；contracts.ts 定义 TeamCommand。

## 依赖和数据

依赖 M001、M002 报名和 M010 配置；拥有团队、成员与申请记录。

## 配置及集成限制

每活动一人一队、一份待处理申请；队长按权限审批、移交、移除或解散，默认 2—4 人。participantCenter 配置决定窗口，截止只读。公开招募不返回邮箱／私有申请。组队不共享个人材料，没有团队统一提交。

## 验证

participant-center.test.ts；浏览器 participant-center.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
