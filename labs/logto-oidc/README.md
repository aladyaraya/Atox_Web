# M013 1.0.0 · Logto＋OIDC 第一阶段

M014 后续扩展：provision 现在额外登记网站沙箱客户端（3104），A/B 仍是两个独立实验应用。主站 M001 内部适配与安全旧账号关联见 [M014](../../src/modules/auth/oidc/README.md)；下面保留第一阶段边界，不表示后续官网适配尚未编写。测试账号仍不接原业务数据库。

状态：隔离实验与接入准备，不是当前网站登录方式，也不代表生产就绪。实际验证与限制见 [验收记录](../../docs/M013-VALIDATION.md)，下一阶段见 [接入设计](../../docs/M013-INTEGRATION.md)。

## 职责和边界

独立部署 Logto、专属 PostgreSQL、仅接收测试邮件的 Mailpit；两个服务端测试应用通过官方 SDK 使用授权码＋PKCE。它们不导入网站模块，不读取根 `.env.local`，不连接 PGlite，不提供账号绑定或管理员授权。网站 `/login`、Cookie、业务外键、迁移和默认入口不变。实验页面不放到主站导航。

固定版本：Logto `1.45.0`、PostgreSQL `17.6-alpine`、Mailpit `v1.31.6`、`@logto/node 4.0.1`、Express `5.1.0`、express-session `1.18.2`；Node 24，客户端依赖使用本目录独立 lockfile。固定的是版本标签，镜像未锁 digest；上线前必须重新做漏洞审查、镜像 digest 固定与升级演练，不将该实验 PostgreSQL 版本当作生产选型。

| 服务 | 地址／存储 | 隔离 |
| --- | --- | --- |
| Logto OIDC | `http://127.0.0.1:3301`，issuer 以 discovery 返回值为准 | 仅回环发布端口 |
| Logto Console | `http://127.0.0.1:3302` | 独立实验管理员，不等于网站 M008 管理员 |
| PostgreSQL | Compose `postgres:5432/m013_logto_lab` | 专属用户、命名 volume，不发布主机数据库端口 |
| Mailpit | `http://127.0.0.1:13325`；SMTP 仅 Compose 内部 `mailpit:1025` | 无真实发信、无 relay、邮箱不持久化；同机用户可查看测试验证码 |
| App A | `http://127.0.0.1:3401` | 独立进程、MemoryStore、`m013_app_a`、独立签名密钥 |
| App B | `http://127.0.0.1:3402` | 独立进程、MemoryStore、`m013_app_b`、独立签名密钥 |

两个应用使用同一回环主机的不同端口；浏览器 Cookie 不按端口隔离，因此不同 Cookie 名＋密钥＋服务端存储才是本实验的会话隔离手段。A 的 Cookie 不能建立 B 的会话。正式多产品应使用各产品独立主机上的 host-only Secure Cookie，不共享 `.example.com` 登录 Cookie。

## 运行

需要 Docker Engine＋Compose v2（`up --wait`）、Node 24、npm，以及浏览器。Windows 可使用已经配置完成的 Docker Desktop；本模块不自动安装系统组件。当前开发电脑缺少可用 Docker／WSL，真实容器验证由独立 GitHub Actions Linux runner 执行，不能宣称已在本机跑通 Logto。

在仓库根终端执行，随后始终留在实验目录：

```powershell
cd labs/logto-oidc
npm ci --ignore-scripts
npm run init
npm run up
npm run provision
```

`init` 只创建本目录 `.env.lab`，生成随机实验密码和不同 Cookie 密钥，已存在则拒绝覆盖。`.env.example` 仅解释变量。`compose` 包装器固定文件、数据库目标、回环端口和项目名，不接受替代 Compose 文件或删除 volume 的选项。实验数据与客户端凭据分别在命名 volume 和本目录 `.data/clients.json`，均不进 Git。禁止把本机网站 `.env.local` 或真实 SMTP 凭据复制进来。

`provision` 只通过固定 Compose 数据库服务临时创建实验 M2M bootstrap principal，再调用真实 Logto Management API：注册两个不同 Traditional 客户端、各自精确回调地址、注销返回地址和独立 secret，设置 SMTP 及 email-only 验证码注册／登录。最后删除 bootstrap principal；不留下常驻 Management API 管理应用。重跑复用本目录客户端记录并核对回调，不按邮箱查找／合并任何用户。中途失败可能留下未记录的实验客户端，先在隔离 Console 检查，不能对业务数据库执行修复。

另开两个终端，在相同实验目录运行：

```powershell
npm run start:a
```

```powershell
npm run start:b
```

打开 A，选择邮箱注册，填写 `alice@m013.example.test` 一类专用测试地址，在 Mailpit 查看验证码；再打开 B 点击邮箱登录，应复用中央身份，无需再收验证码。测试地址无需、也不应是真实用户邮箱。Mailpit 接收成功只验证流程，**不是正式邮箱所有权证据**。

如果需要查看 Logto Console，它仍采用上游单独的初始管理员创建流程；只允许使用新的实验管理员凭据，不复制网站管理员账号或给网站账号授予角色。自动化验证不需要创建 Console 人类管理员。

停止应用进程后执行 `npm run down`；此命令保留实验 PostgreSQL volume。重启不重置数据，App A/B 内存会话会失效，但中央会话仍由 Logto 管理。不提供默认清库／重建命令，处理实验 volume 必须先核对准确的 Compose 项目和 volume，不能涉及网站 `.data`。

## 页面与接口

| 路径（分别挂载在 A、B） | 行为 |
| --- | --- |
| `GET /`、`GET /health` | 明确标注本地测试的说明／健康检查 |
| `GET /me` | 本应用状态；登录返回已验证 issuer、subject、email 和 emailVerified，无令牌；匿名 401 |
| `GET /login`、`GET /register` | 启动官方授权流程；不接受动态 next 或 redirect 参数 |
| `GET /callback` | 精确固定回调；SDK 验 state、PKCE、签名、issuer、audience、有效期，适配器额外校验绑定 nonce；失败 400 且销毁当前实验会话 |
| `POST /logout/local` | 同源＋CSRF；只销毁本应用会话、清 Cookie，不访问中央退出端点 |
| `POST /logout/central` | 同源＋CSRF；官方 SDK 注销本客户端并请求中央 RP initiated logout，再销毁本应用会话 |

SDK 生成随机 state、S256 PKCE verifier，verifier／令牌只保存在服务端 MemoryStore。成功回调再次轮换 session ID 和 CSRF；响应禁止缓存和被 iframe 嵌入，不打印授权码、令牌、邮件或 session 内容。Cookie 为 HttpOnly／SameSite=Lax；仅实验 HTTP 使用 `Secure=false`。

只有 `NODE_ENV=development`、`ENABLE_LOGTO_LAB=true`、本地确认值同时满足才加载客户端。任何生产／未启用启动路径下所有 HTTP 页面与接口 404；不读取客户端文件、不发起 OIDC 请求。监听固定回环地址，拒绝错误 Host。

## 退出语义

“仅退出本应用”后，其他应用会话和中央登录状态保留；再次访问 A 的登录流程仍可能 SSO。“退出本应用及中央登录状态”请求 Logto 清除中央登录状态，但 B 已有本地会话可能继续有效。本轮明确验证这个差异，**不提供也不宣称「退出所有产品」**。跨产品撤销需要后续会话索引、撤销通知／状态检查、刷新令牌策略和独立验收。

## 验证与维护

```powershell
npm test
npx playwright install chromium
# 上游服务先 up/provision；此命令自动启动并停止 A/B，不要同时手动启动它们
npm run test:oidc
```

`npm test` 不需要 Docker：检查开发开关、生产 404、伪造回调、Host/Origin、防跨应用 Cookie 和无动态跳转。`test:oidc` 必须使用真实固定 Logto＋PostgreSQL＋Mailpit；不能用 mock 成功替代验收。浏览器测试关闭 trace／截图／视频，不上传含令牌或测试邮件的调试资料。

CI [logto-lab.yml](../../.github/workflows/logto-lab.yml) 在一次性 Ubuntu runner 内运行真实部署和跨应用测试；主站原 CI 继续回归。实验不部署至任何生产环境，不把主站 `.data` 挂载进容器。

认证维护者负责 SDK、OIDC 状态与未来适配边界；基础设施维护者负责固定镜像、专用 PostgreSQL 备份／升级和回环暴露；QA 负责真实双应用、负例和退出边界；网站 M008 管理员继续由网站维护者负责，Logto 角色不向其同步。任何人修改 issuer、客户端、Cookie、SDK／镜像版本，都必须重跑两层测试并更新验收记录。真实邮件、TLS／域名、生产存储、可用性、审计留存、密钥轮换、监控、旧账号绑定和最终网站接入另行验收。

实现依据（访问日期 2026-10-22）：[固定 Logto release](https://github.com/logto-io/logto/releases/tag/v1.45.0)、[上游 OSS 运行说明](https://docs.logto.io/logto-oss/get-started-with-oss)、[官方 SDK 接入](https://docs.logto.io/quick-starts/express)、[Management API](https://docs.logto.io/integrate-logto/interact-with-management-api)、[SMTP connector](https://docs.logto.io/integrations/smtp)、[Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/)。SDK 的 nonce 补充校验来自已安装 4.0.1 源码检查，不假称 SDK 本身验证了 nonce。
