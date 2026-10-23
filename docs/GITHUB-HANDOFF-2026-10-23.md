# GitHub 分支与交接记录 · 2026-10-23

目标仓库：[aladyaraya/Atox_Web](https://github.com/aladyaraya/Atox_Web)。本次只整理已授权源码、分支和交接，不部署生产、不升级依赖、不修改运行数据。

## 合并范围

既有串联 PR 按依赖顺序合入 main，采用 merge commit 保留模块提交历史：

1. [PR #1](https://github.com/aladyaraya/Atox_Web/pull/1)：M012 项目详情、点赞评论与排序。
2. [PR #2](https://github.com/aladyaraya/Atox_Web/pull/2)：M013 隔离 Logto OIDC 实验。
3. [PR #3](https://github.com/aladyaraya/Atox_Web/pull/3)：M014 官网 OIDC 与安全身份映射。
4. `codex/m015-management-handoff`：M009 1.1.2 审核时间与总表优化、M015 1.0.0 用户项目投稿／审核／发布，以及本轮运行交接整理。

每次合并核对 PR 的最新检查及 GitHub 合并状态；只在确认分支头已进入 main 后清理远端／本地旧分支，不强推或改写 main。实际状态以各 PR 和 Actions 为准。

## 数据与验证

本次追加源码中的 0010—0012 迁移及其 snapshot／journal，既有 SQL 不改写。真实数据库在模块开发时已停服备份迁移并核对，本次 Git 操作不再打开或迁移真实库。原环境、账号、会话、管理员、私人附件和本地历史归档留在本机。

M015 实际本地验证：服务 137 项、单次全量浏览器 59 项、最终投稿专项 4 项、生产保护 2 项、票务关闭 1 项及类型／Lint／隔离构建通过。详见 [M015 验收](M015-VALIDATION.md)、[M009 修正验收](M009-1.1.2-VALIDATION.md)。GitHub 检查另以对应提交的 `verify`、`logto-isolation`、`website-oidc` 结果为准；不将旧 PR 或历史本地通过视为新提交通过。

Git 提交扫描检查实际 index。新增源码采用明确路径暂存，两个未跟踪的个人产品资料（首页 XMind、审核优化方案）留在本地；不提交密钥、`.data`、测试报告／trace 或源码压缩包。

## 接手入口与限制

从最新 main 开始后续任务；运行说明见 [HANDOFF](HANDOFF.md)，当前模块与状态见 [MODULES](MODULES.md)、[PROJECT_STATUS](PROJECT_STATUS.md)。main 为统一开发基线，不创建生产版本标签。生产邮箱、支付、数据库／存储、安全依赖处理及最终全站部署仍单独安排。

核对时 main 未开启 GitHub 分支保护。本轮不擅自调整仓库管理策略；后续可另行设置强制 PR／检查／审阅规则，不能以无保护为由跳过本次 CI。
