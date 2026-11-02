# 分支和 PR 的唯一维护索引

main 是共同开发主线，不等于已部署。完成模块、合并 PR、公开运营分别记录。仓库可见性以 GitHub 实际设置为准，不沿用早期“私有仓库”描述。

| 分支 | 职责 | 定位 |
| --- | --- | --- |
| main | 官网核心业务、真实本机邮箱、必要安全补丁 | 在用主线 |
| codex/module-m003-ticketing | 模拟售票、库存、订单、渠道模拟 | 独立预备，不自动合并 |
| codex/module-m013-m014-oidc | Logto 实验与官网安全映射 | 独立预备，不自动合并 |
| codex/m016-production-readiness | 生产适配和部署路线参考 | 暂缓，不自动合并 |

两个模块分支先保存了完整来源 e2b0198，再以收敛主线为基础只恢复各自功能，不复制原站数据库。主线保留历史迁移和表元数据，不提供预备模块运行入口。

## PR 的去向

| PR | 处理 |
| --- | --- |
| [#1](https://github.com/aladyaraya/Atox_Web/pull/1) | 已合并的详情与互动，保留历史 |
| [#2](https://github.com/aladyaraya/Atox_Web/pull/2) | 历史合并过的 Logto 验证，本次从当前主线拆出 |
| [#3](https://github.com/aladyaraya/Atox_Web/pull/3) | 历史合并过的官网 OIDC，本次从当前主线拆出 |
| [#4](https://github.com/aladyaraya/Atox_Web/pull/4) | 已合并的投稿发布和材料审核优化，保留核心业务 |
| [#5](https://github.com/aladyaraya/Atox_Web/pull/5) | 本轮整合入口：真实邮件、预备模块移出、文档收敛，并承接 #6；检查及合并状态以链接为准 |
| [#6](https://github.com/aladyaraya/Atox_Web/pull/6) | 安全候选 e2b0198，由 #5 承接；GitHub 已因提交进入其 base 分支自动标记为合并，不另建重复安全 PR |
| [#7](https://github.com/aladyaraya/Atox_Web/pull/7) | 生产适配参考，改为暂缓草稿，不是主线候选 |

不为预备模块建立待合并 PR。以后真正继续开发时，先检查与当时 main 的兼容性，再开清晰范围的新 PR。临时整合分支不作为长期功能分支。

## 协作

一项工作一个职责分支，同文件并发前确认归属。只删除已合入、无独立用途且未被活动工作树占用的分支；不强推，不重写已合并历史，不清理他人工作目录。数据、凭据和产品资料留在原处。
