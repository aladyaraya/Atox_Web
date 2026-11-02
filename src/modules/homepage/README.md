# M005 官网长页首页

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

首页主视觉、组织介绍、内容方向、活动／项目入口及页脚。

components/home-view.tsx 与 config/contracts；根页面取得 M001 身份并读取 M011 已发布内容，不新增业务 API。

## 依赖和数据

复用共用导航、语言和 M011 发布核。

## 配置及集成限制

双语、移动端、锚点和减少动画偏好。导航指向现有 /events、/projects；不显示预备模块入口。品牌／布局仍属共享代码，不是任意拖拽装修。

## 验证

浏览器 homepage.spec.ts、navigation.spec.ts；内容变更另跑 content-management.test.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
