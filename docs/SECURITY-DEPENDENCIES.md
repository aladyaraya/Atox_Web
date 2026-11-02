# 依赖安全整改 · 2026-11-02

基线来自干净 worktree 的 16a6f0b，非同时被其他任务修改的原工作区。执行 npm ci，保留 package-lock 与独立实验的锁文件；未运行 npm audit fix --force，没有强制覆盖不同主版本的传递依赖。

## 版本与审计结果

| 链路 | 原版本 | 候选版本 | 原因 |
| --- | --- | --- | --- |
| Next.js / eslint-config-next | 16.4.0 | 16.4.3（固定版本） | 保持 16 主版本，补齐已核实的安全补丁 |
| eslint-plugin-react-hooks→Zod | 4.6.5 | 4.6.7 | 上游允许范围内刷新锁文件，达到修复下限 4.6.6 |
| 实验 express 5.1.0→body-parser | 2.3.0 | 2.4.0 | 上游允许范围内刷新；实验主版本、SDK 及会话配置不变 |

| 审计对象 | 升级前 | 升级后 |
| --- | --- | --- |
| 根工程全部依赖 | 22 条：严重 1、高危 1、中危 20 | 20 条：严重 0、高危 0、中危 20 |
| 根工程生产依赖 | Next.js 受影响；以升级前完整报告为准 | 0 |
| 独立实验全部依赖 | 高危 1 | 0 |
| 独立实验生产依赖 | body-parser 受影响 | 0 |

数量是 npm 审计的依赖条目，包含父链传播，不等于独立漏洞数。原始 npm JSON 和安装／测试日志仅在忽略的 .data/baseline-audit；版本可从两个受审查锁文件复现。审计是 2026-11-02 的快照，后续公告可能改变结果。

## 遗留中危与处理约束

- minimatch <11.0.1：当前多个 ESLint 依赖链仍使用 3.x／10.x。修复公告要求 11.0.1；API 兼容性不同，不盲目把所有父包强制替换到 11。
- esbuild <=0.24.2：drizzle-kit→旧 esm-loader/core-utils 仍带 0.18.20。当前稳定 drizzle-kit 已为 0.31.11；不采用审计建议降级 0.18.1 或未经验证的 1.0 beta。
- 只在受控开发／CI 使用这些工具，对可信源码执行；不对公网开放开发服务器或数据库 Studio，不运行未经审查的 glob／构建插件。不将这些限制描述为漏洞修复。
- 工具链主版本迁移独立安排，保留为上线审查待办。若其可达性或公告严重度提高，重新阻断，不静默豁免。

## 持续门禁

npm run check:security 对根工程和实验分别执行全部／生产依赖审计。高危和严重项阻断，网络或解析失败也失败；原始 npm 输出不直接转发到公开报告。CI 在安装后运行该命令；不依赖本机凭据或真实 SMTP。中危数量仍输出，不隐藏，不以门禁通过宣称安全全清。

## 原始公告

- [Next SVG / image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw)：补丁起点 16.4.1；项目同时已有 sharp 0.35.5，但其他 Next 公告仍需补丁。
- [Next use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr)：补丁起点 16.4.1。
- [Next Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)。
- [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)：4.6.6。
- [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828)：2.4.0。
- [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)：11.0.1。
- [esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99)：0.25.0。
