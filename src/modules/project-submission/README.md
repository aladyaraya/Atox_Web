# M015 用户项目投稿、审核与发布

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

作者草稿、上传、不可变送审、管理员审核／发布、反馈、下架与公开来源。

server.ts、client.ts、contracts.ts；/projects/submit、/account/projects、/admin/projects。本人 API 为 /api/account/projects，管理为 /api/admin/projects，附件 /api/project-files/:id。

## 依赖和数据

依赖 M001、M004/M010 活动、M002 报名及 M008 admin:projects；拥有项目主记录、送审版本和附件。

## 配置及集成限制

独立项目不限时；活动项目须已报名并遵守提交期，首次送审后关联固定。草稿不影响线上旧版，当前审核通过后还须明确发布。作者撤销公开授权后需重新送审批准才能恢复。公开字段白名单排除邮箱、PDF、草稿和内部备注。封面必填，截图最多六，PDF 可选仅审核；图片 5MiB/PDF 20MiB，真实校验、归属隔离。M002 材料不自动导入，管理员不代改作者正文，无团队统一投稿。

## 验证

project-submission.test.ts；浏览器 project-submission.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
