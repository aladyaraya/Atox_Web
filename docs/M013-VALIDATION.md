# M013 第一阶段验收记录

2026-10-22。交付目标是隔离部署配置、两个真实 OIDC 客户端的验证工程，以及当前项目接入设计；**不等同于当前网站切换登录或生产就绪**。

## 本机验证

- 已阅读 AGENTS、PROJECT_STATUS、MODULES、M001 README；检查 auth/server.ts、session.ts、service.ts、schema／contracts、业务用户外键及 M008 authorizeAdmin。阅读已安装 Next 16.4 Route Handlers 指南和官方 Logto 接入、部署、SMTP 文档。
- 当前电脑无 Docker／Podman，WSL 提示未安装。没有安装系统虚拟化组件，没有声称真实 Logto 已在这台电脑运行。真实部署测试由隔离 Linux CI 执行，结果后续记录在此及 PR。
- 本地 5 项隔离测试通过：显式开发开关、真实生产启动全路径 404、回调／Host／Origin 拒绝、Cookie 独立及诊断脱敏。实验依赖独立 lockfile，安装审计当时 0 已知漏洞；不把这项结果当成所有镜像安全审计。
- 认证源码、共享 DB、Drizzle 迁移、真实 `.env.local`、管理员授权未修改。未打开网站数据库执行迁移／绑定；原未提交产品思维导图保留。
- 首次真实环境验证：Compose 部署／客户端注册／SMTP 配置成功，安全负例通过；注册后的自动跳转被测试误认作仍需点击 Continue，改成等待实际回调完成，未绕过 OIDC／OTP。
- 主站首次回归 48/49：票务测试在创建订单后仅等待同步 URL，异步 RSC 刷新可能移除弹窗的原触发按钮。该用例改为重载已持久化订单后再执行原 Esc／焦点断言；没有改票务业务代码或删除／跳过断言。最终回归另录。
- 双应用注册与 SSO 已实际成功；原生退出表单因 no-referrer 策略发送 Origin:null 被严格同源检查拒绝，改成 same-origin Referrer-Policy，保留 Origin＋CSRF 校验并避免跨来源泄漏回调 URL。未通过接受空 Origin 放宽保护。

## 真实 Logto CI 验收

独立工作流 `.github/workflows/logto-lab.yml` 使用固定 Logto／PostgreSQL／Mailpit，运行本目录 provision 和真实浏览器流程。验收要求：

- A 邮箱注册经 Mailpit OTP 成功；B 独立客户端取得相同可信 issuer/sub，不新增邮件。
- 两客户端 Cookie／服务器 session 独立；授权请求为 code＋S256、state 和 nonce；局部退出后中央状态可复用。
- 中央退出后 B 已有本地会话仍可存在，清 B 本地会话后再登录需重新认证；因此不提供“退出所有产品”。
- 伪造、跨客户端及已消费回调、非法外部回调、无效 client secret／凭证和缺少 verifier 拒绝，不能建立本地身份。
- 配置、token、授权码、测试邮件、认证 trace、PostgreSQL volume 不上传为制品。测试不挂载网站数据，无生产部署。

实际远端执行结果在完成验证后补录；在此之前不标注上述场景已通过。

## 集成与运行边界

没有主站 OIDC 路由、映射表、账号绑定、生产邮件、第三方登录、合作网站、全局撤销或生产环境变更。两应用只提供隔离实验状态，不给网站授予身份或权限。重启 App 清内存会话；Logto 专属 volume 独立保留。第二阶段改动和验收见 [接入设计](M013-INTEGRATION.md)。
