# M009 正式材料审核

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

材料总表、筛选统计、通过／驳回、撤回通过、内部协调和审核窗口。

server.ts 的 listMaterials/getMaterial/decideMaterial/revokeApproval/saveCoordination/getReviewPolicy/setReviewPolicy；/api/admin/materials。

## 依赖和数据

依赖 M008 admin:materials、M002 正式材料及共享业务审计。

## 配置及集成限制

只读正式材料及其引用附件，不读草稿。审核默认跟随活动时间，可选不限时、自定义或暂停，修改需原因。双修订防止处理过期材料，审计同事务；撤回原因对选手可见，内部协调不公开。重提仍服从原提交截止，审核通过不发布项目。

## 验证

material-review.test.ts；浏览器 material-review.spec.ts。最新原模块验收见 docs/M009-1.1.2-VALIDATION.md。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
