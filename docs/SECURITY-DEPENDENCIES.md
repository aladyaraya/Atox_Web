# 安全依赖维护

主线承接 e2b0198 的最小安全升级：Next.js／eslint-config-next 16.4.3，根 Zod 4.6.7；移出 Logto SDK 和独立实验。实验 body-parser 2.4.0 的修复随 OIDC 分支保留。

check:security 审计当前根锁文件及实际存在的实验锁文件，区分全部／运行依赖。高危、严重和审计不可用均失败；不使用 force fix 或降级工具掩盖结果。

本轮初始结果：根运行依赖 0，根开发工具链 20 个 moderate，主要为旧 minimatch／esbuild 依赖链；未宣称全部依赖无漏洞。限制只处理可信源码，不暴露开发服务或数据库 Studio。工具链主版本升级另行处理。

最新实际运行以 CORE-CONSOLIDATION-VALIDATION 和 CI 为准，不把旧审计结果永久视为安全。
