# M010 活动发布与 M011 首页管理

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

两业务共用结构化草稿、管理员预览、发布／下架和业务审计。

server.ts 的 getManagedContent/listManagedEvents/createManagedEvent/changeContent/readPublishedEvent/readPublishedHomepage；/api/admin/content/events、/events/:id、/homepage。

## 依赖和数据

依赖 M008 admin:content；拥有 managed_content，公开读取只取 live。

## 配置及集成限制

保存不改变公开版，修订冲突保留输入；发布动作与审计同事务。活动 ID 稳定，双语时间／赛道／规则可编辑，封面只选内置 SVG。下架保留业务记录。首页编辑结构化正文及 metadata，不支持脚本、拖拽或任意代码。

## 验证

content-management.test.ts；浏览器 content-management.spec.ts 与消费者回归。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
