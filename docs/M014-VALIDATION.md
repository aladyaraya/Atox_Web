# M014 1.0.0 · 验收记录

本轮为本地官网 OIDC 接入及安全映射，生产关闭。真实 Logto 使用固定独立 PostgreSQL／Mailpit 的 Linux CI；本机缺 Docker／WSL，不把服务测试当协议成功，也不声称本机已经安装 Logto。

- 新增 15 项认证服务／协议测试，全站最终 **112 项服务测试通过**；UUID／昵称保留、同邮箱不合并、独立批准、并发绑定、会话撤销、防开发码绕过、批准过期、唯一约束、审计回滚、篡改流程、重启及配置撤销。
- 本机与 CI 的类型／Lint／构建通过，原业务及默认禁用共 **50 项浏览器回归**通过；开发票务关闭 1 项、生产保护 2 项通过。生产测试主动设置 ENABLE_LOGTO_LOGIN=true 仍验证入口 404。
- 固定独立 Logto／PostgreSQL／Mailpit 的 **3 项真实浏览器协议验收通过**；不是自造 token 冒充 Logto。另有本机仅 SDK 协议夹具测试，独立验证真实 RSA 签名、PKCE、nonce 和 state，明确不将此夹具称为 Logto。
- 0009 只新增五表，0000—0008 不改。迁移前停服完整备份，迁移后 **25 张旧表记录数和完整内容 SHA-256 摘要不变**、真实 .env.local 摘要不变，新五表为空，真实账号没有自动绑定。备份与复核记录仅留本地 .data，不上传。
- 原 3000 开发站已恢复，localhost:3000/login 返回 200；新增隔离站使用 3104。预检确认本机缺运行中的 Logto 时明确拒绝启动，不打开原 DB。

## 可复核证据

源码基线 f6e92fc： [完整 CI](https://github.com/aladyaraya/Atox_Web/actions/runs/39750193600)；[真实官网 OIDC](https://github.com/aladyaraya/Atox_Web/actions/runs/39750193506)。同分支 M013 固定 A/B 回归 [通过](https://github.com/aladyaraya/Atox_Web/actions/runs/39744812756)。后续仅整理交接文档，交付 PR 的最终 checks 应继续通过；不部署或自动合并。

真实流程分别覆盖：

1. 网站 Logto 邮箱登录、新 UUID、M001 返回身份、A 应用复用中央状态、网站重启持久会话、本地退出和中央退出边界；新用户没有管理员权限。
2. 同邮箱旧账号暂停且无本地登录，新鲜重验、无批准拒绝、停止 Next 后离线批准、关闭 DB 再重启，原浏览器明确确认后保留原 UUID、昵称、正式材料、授权图片／PDF 和原管理员角色。
3. 伪造回调、外站 Origin、伪造成功 JSON、关闭开发投递被拒绝；外站 next 回落 /account、PKCE S256、手机登录布局。

发现当前 Next 开发请求 URL 使用内部 localhost，严格直接比较 origin 会拒绝实际注册的 127.0.0.1。修复为核对真实 Host／协议／回调路径，再由固定注册配置构建 SDK 回调 URL；新增缺 Host、外站 Host、错协议／路径拒绝测试。保留 issuer／state／nonce／PKCE 校验。回调 query 不写普通 Next 请求日志，诊断仅固定验证阶段和错误码；动态授权路径及 query 均在测试报告脱敏。

M014 website Logto integration 工作流验证第三客户端、M001 登录／A 应用 SSO、碰撞／重验／停服批准／确认、材料附件及原管理员授权保留和退出边界。敏感 trace／截图／视频关闭，报告不含 token。

维护和证据规则见 [README](../src/modules/auth/oidc/README.md)。真实邮件、域名／HTTPS、生产开关、部署 DB、全局撤销和合作网站另行实施；当前不宣称生产就绪或退出所有产品。
