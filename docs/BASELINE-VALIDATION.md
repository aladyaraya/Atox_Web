# 候选基线与验证记录 · 2026-11-02

## 可复查版本

| 基线 | 提交／关系 | 用途 |
| --- | --- | --- |
| main | 6efb6a9187b790ced741a5504be2fb8e5fa16352 | 已合并原开发基线，本轮不变 |
| 原 PR #5 | 3a7173a19fe5dfa511224bfb1414c5355cab4396 | 邮件／任意收件；曾因停售早鸟用例失败 |
| 修复 PR #5 | 16a6f0b；codex/m001-local-smtp | 日期隔离与过期购买保护，待审阅未合并 |
| 安全候选 | codex/security-baseline，基于 16a6f0b | 升级、门禁和文档；最终提交号以安全 PR head 为准 |

[PR #5](https://github.com/aladyaraya/Atox_Web/pull/5) 的最新 [verify](https://github.com/aladyaraya/Atox_Web/actions/runs/41422267571)、[push verify](https://github.com/aladyaraya/Atox_Web/actions/runs/41422261630) 及 [网站 OIDC](https://github.com/aladyaraya/Atox_Web/actions/runs/41422267483) 均成功。此前失败记录不删除，也不拿旧提交结果代替新结果。

## 本地验证

- 修复 PR：144 项全量服务，18 项售票／夹具专项，票务浏览器 4 项、增强直接下单拒绝专项最终 1 项，类型／Lint 通过。详见 BASELINE-PR5-VALIDATION.md。
- 安全候选：干净独立 worktree，npm 安装同步锁文件，Next/eslint-config-next 16.4.3、Zod 4.6.7、实验 body-parser 2.4.0。144 项服务、类型检查、Lint、隔离构建通过。
- 实验单测 5 项通过；本机未检测到 Docker，未启动 Logto，也不宣称本机执行了真实容器协议。协议回归使用原专用 CI。
- 生产保护 2 项、开发票务关闭 1 项通过。网站构建、测试数据库、上传、输出均为该 worktree 下独立路径，不复制原真实数据。
- npm run check:security 通过；根／实验全部及生产依赖分别审计。根仍中危 20，根生产和实验为 0；高危／严重为 0，见 SECURITY-DEPENDENCIES.md。
- 本机全量浏览器首次因 3100 被原共享工作区另一任务占用而未启动；没有复用或终止对方服务。完整浏览器验收以本安全候选最新 CI 结果为准，不把端口冲突当通过，不将 PR #5 的浏览器结果冒充安全候选结果。

## 交付与验收约束

源码／索引扫描通过后才能提交。真实授权码、测试邮箱、会话、数据库、PDF／私人附件、认证 trace 和运行日志不上传。两个原产品资料保留；共享原工作区中其他任务的生产依赖与文件不纳入本候选。

安全 PR 指向 PR #5 分支，形成依赖审阅顺序。两个 PR 保持未合并，不清理分支、不创建生产标签或部署。安全候选最终提交号、GitHub 运行链接与实测数量记录在安全 PR 的验证表；以该 PR 最新 head 的检查为准，本文的本地结果不替代远端检查。上线结论保持“尚有阻塞”，见 RELEASE-READINESS.md。
