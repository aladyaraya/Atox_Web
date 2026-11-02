# 本机运行与接手

先读 README、MODULES、PROJECT_STATUS 和 BRANCHES-AND-PRS。使用 Node 24，执行 npm ci。只有新机器复制 .env.example，已有配置和数据不能覆盖。

## 启动与邮件

npm run dev 默认本机 3000，APP_ORIGIN 为 http://localhost:3000。默认开发邮箱在 /dev/mail 查看。真实发信使用 MAIL_TRANSPORT=smtp、MAIL_LOCAL_SCOPE=website、ENABLE_DEV_MAIL=false；QQ SMTP 参数私下配置，详见认证 README。

跨工作树继续使用原账号时，DB_PATH、UPLOAD_PATH 指向原位置，MAIL_WEBSITE_DATA_ROOT 指向原 .data 目录，AUTH_SECRET 保留原值；不要复制整库去填新环境。一个 PGlite 目录不能被两个进程同时使用。新工作树的私有环境文件不提交。

npm run mail:preview 在 3105 使用独立 .data/mail-test 数据，其中账号不等于原主站账号。关闭进程或重启电脑后需重新启动，本机服务不是公网常驻网站。

## 管理员及迁移

getDb 首次连接按 0000—0013 迁移，不重置数据。首位管理员必须已有可信注册账号，停同库网站后运行 admin:bootstrap，后续在后台授权。不重复初始化来修复角色，不自动给开发者或外部身份授予权限。

旧票务和外部身份表保留兼容；绑定不自动解除，不能用开发邮箱绕过。旧邮箱会话保留，旧 OIDC 会话拒绝。

## 验证

依次运行 check:repository、check:security、lint、next typegen、typecheck、npm test、test:e2e、build、test:production。浏览器使用独立 .data 夹具，默认 3100；生产保护 3101。build/start 的 NEXT_DIST_DIR 一致。同端口被其他任务占用时协调等待，不终止对方进程。

当前无生产部署。预备模块的启动说明只在对应分支维护，不从旧文档在主线开启。
