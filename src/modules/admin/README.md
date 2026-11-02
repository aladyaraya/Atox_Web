# M008 管理权限与审计

当前主线维护说明；旧版开发轨迹通过 Git 历史查询。主线状态和分支见根 docs/MODULES.md、BRANCHES-AND-PRS.md。

## 职责与公共入口

后台入口、超级／运营管理员及不可变权限和业务审计。

server.ts 的 requireAdminPage/getAdministrator/authorizeAdmin、授权和审计服务；/api/admin 下各业务接口分别校验。

## 依赖和数据

依赖 M001 本地身份；拥有管理员及审计表，权限不存为永久 Cookie。

## 配置及集成限制

超级管理员可管角色与权限审计；有效超级及运营管理员按权限处理材料、项目、评论和内容。写事务重新鉴权，保留修订冲突、禁止自降级／停用及最后超管保护。首位管理员仅通过停服 CLI 绑定已有账号，没有公开初始化接口，不从外部身份赋权。

## 验证

admin.test.ts、admin-cli.test.ts；浏览器 admin.spec.ts，生产 admin.spec.ts。

服务使用 `npx tsx --test tests/<文件>`，浏览器使用 `npx playwright test tests/e2e/<文件>`。完整命令及隔离要求见根 docs/HANDOFF.md；实际本轮结果见 CORE-CONSOLIDATION-VALIDATION.md。
