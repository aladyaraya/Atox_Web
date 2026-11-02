# 上线候选基线审查 · 2026-11-02

本轮仅 PR，不合并、不部署，不新增业务模块／API／数据库表或迁移。main=6efb6a9，邮件 PR #5 原候选=3a7173a，日期修复=16a6f0b；安全整改基于该修复单独分支。两个未跟踪产品资料、真实环境、用户、附件和运行产物留在原工作区。共享工作区同时出现生产依赖改动，已保留且不纳入本候选；本轮使用独立 worktree 和临时数据。

## 方法与范围

人工检查现有模块的服务端公开入口、权限与写事务、文件读取／公开投影、审核发布、付款状态处理及对应测试；检查 API 适配的 Origin／会话校验、错误响应和日志。不是渗透测试或无漏洞保证。下表的测试名称对应 tests/*.test.ts、tests/e2e/*.spec.ts；实际执行结果统一见 BASELINE-VALIDATION.md。

| 模块 | 入口及状态 | 权限／数据核对 | 对应验证 |
| --- | --- | --- | --- |
| M001 | /login、/account；开发邮箱与本机 SMTP | 用户 UUID／会话摘要、验证码消费与限流、严格同源、安全 next；生产登录未就绪 | auth、smtp-auth、return-path、login |
| M002 | /events/:id/register、materials | 活动与用户联合隔离，草稿／正式材料分开，附件归属、声明、时间和修订事务检查 | event-participation、event-participation.spec |
| M003 | /preview/ticketing/demo 及 checkout/orders；仅模拟 | 服务端计价／库存预留、幂等、签名通知、未知结果不重复付款、迟到成功对账 | ticketing、ticketing-fixture、ticketing-ui、ticket-orders |
| M004 | /events、活动详情 | 只读公开字段，使用已发布配置，未知／下架 404 | event-board |
| M005 | /、首页导航与页脚 | 结构化纯文案，无任意脚本编辑／外部站品牌资源 | homepage、navigation |
| M006 | /projects、/:id | 统一读取受管公开版本，无静态回退复活，返回白名单字段 | project-board |
| M007 | 活动大厅、teams、my-team、applications | 已报名、一人一队、队长权限、名额／修订／活动窗口，个人材料不共享 | participant-center |
| M008 | /admin、administrators、audit | 数据库实时权限；操作事务复核，保护最后超管／禁止自降级，审计原子写入 | admin |
| M009 | /admin/materials | 正式资料，双修订、审核窗口及撤回，内部协调不返回选手 | material-review |
| M010 | /admin/events | 稳定 ID、结构化草稿／预览／发布／下架，更新与审计同事务 | content-management |
| M011 | /admin/content/homepage | 管理员预览，发布换版，下架恢复明确演示基线 | content-management、homepage |
| M012 | 项目详情、点赞／一级评论、评论管理 | 可见项目校验、作者删除、昵称无邮箱兜底、限流／请求幂等，管理员即时权限 | project-interaction |
| M013 | labs/logto-oidc；独立实验 | 两套会话、固定 issuer、PKCE/state/nonce；不接入真实站 | 实验单测／独立容器 CI |
| M014 | auth/oidc 内部适配；本机关闭 | 本地 UUID 映射、独立证据及明确关联，不按同邮箱合并，旧关联防旁路 | oidc、网站协议 CI |
| M015 | /projects/submit、/account/projects、/admin/projects | 作者草稿、不可变送审、公开旧版分开；管理员不读未送审草稿，公开图片引用校验，PDF 永不公开 | project-submission |

## 发现与处置

| 编号／级别 | 位置与复现 | 影响与结果 |
| --- | --- | --- |
| B01 / P1 | tests/e2e/ticketing.spec.ts 固定 early；售卖期 2026-11-01 已截止。两次远端 CI 同点失败 | 原业务拒绝购买是正确行为。16a6f0b 使用标准票及严格隔离的相对售期，新增停售报价／直接下单和精确边界测试；不改真实配置 |
| B02 / P0 依赖 | Next.js 16.4.0 命中官方严重／高危公告；不是本次确认的业务可利用攻击 | 升至 16.4.3，eslint-config-next 同步；不以图片库已修复代替其他 Next 补丁。版本证据见 SECURITY-DEPENDENCIES.md |
| B03 / P1 依赖 | 根开发工具链 Zod 4.6.5，公告 <4.6.6；未发现业务直接用该包处理请求 | 兼容更新至 4.6.7，保留 React／工具链主版本 |
| B04 / P1 依赖 | 实验 express→body-parser 2.3.0，高危压缩请求 DoS 公告 | 只更新传递锁定版本至 2.4.0，未启用本机 Logto 或改变会话行为 |
| B05 / P2 遗留 | 开发工具链 minimatch 与旧 esbuild，20 个受影响依赖条目 | 无强制跨主版本覆盖／旧版工具降级；限制只处理可信源码，不暴露开发服务／Studio。保留待办，不宣称全依赖无漏洞 |
| B06 / 运行说明 | 本机端口无监听／进程停止时无法访问，日志未给出退出原因 | 保留启动与重启说明；本地服务不是正式常驻部署。启动恢复不是数据库修复 |

## 安全边界结论

本轮抽查及回归核对未发现新增已证实的 P0/P1 业务代码缺陷，不表示已穷尽所有攻击面。现有 authorizeAdmin 在关键写事务内重查；M002/M015 私有附件读取校验归属及正式／公开引用；M009/M015 审核通过不自动发布；付款 adapter 调用在写锁外，状态合并核对订单、交易、金额和币种。对应越权、撤权、冲突、失败回滚及乱序通知断言保留，没有通过跳过测试使 CI 变绿。

本候选仍不满足正式上线条件，见 RELEASE-READINESS.md。无可持久化真实数据的生产演练，无生产登录／真实付款；开发工具中危仍需后续升级评估。PR #5 和安全 PR 均须最新 CI 通过，保持待审阅，不能拿旧提交的通过结果替代。
