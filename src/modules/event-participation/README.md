# M002 个人报名与材料

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

多活动个人报名、独立草稿、正式提交、私有附件及本人结果。

server.ts 的 resolveEvent/resolveFiles 读取当前发布活动；GET participation/materials、POST registration、PUT materials/draft、POST materials/submit 和 files 位于 /api/events/:eventId。contracts.ts 定义 DTO 和修订输入。

## 依赖和数据

依赖 M001 身份、M010 发布配置和 M008/M009 审核；拥有报名、材料、附件，均按活动及 users.id 隔离。

## 配置及集成限制

报名成功即资格，重复报名复用记录。提交开放期包含开始、不含截止；保存草稿不破坏正式稿，修订冲突 409 保留输入。待审／驳回可在开放期修改，通过只读。封面一张、截图最多六张，PNG/JPEG/WebP 每张 5MiB；PDF 一份 20MiB。UPLOAD_PATH 私有存储，校验真实内容、用途、归属；M009 只看正式材料，不自动公开到 M015。

## 验证

event-participation.test.ts；浏览器 event-participation.spec.ts 和 material-review.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
