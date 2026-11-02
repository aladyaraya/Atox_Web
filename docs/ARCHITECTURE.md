# 当前架构

单 Next.js App Router／TypeScript／React／Tailwind 全栈应用。业务共用本地用户 UUID、PGlite 和写协调器；不为每个模块单独部署服务。

## 调用方向

页面／API → 模块 server 或 client → 业务服务 → 共享数据库／文件校验。浏览器只引用安全 contracts，不引入服务端秘密。身份经 M001，授权由 M008 本地角色提供，业务状态由各模块负责。

M005 首页读取 M011 已发布内容；M004 读取 M010 活动发布源，M002 报名材料和 M007 组队绑定活动并在事务中重查。M009 只审核正式材料。M006 展区和 M012 互动统一读取 M015 公开项目版本；M002 私有材料不自动导入项目展区。审核通过和公开发布分别控制。

## 数据与附件

src/lib/db.ts 保持 PGlite 单例和 serializeDatabaseWrite；排队整个事务，不递归排队。邮件网络调用不占写锁。同一数据目录只允许一个进程，PostgreSQL／多实例不在当前主线。

历史 0000—0013 SQL、snapshot、journal 保留；0013 仅增加发送时间索引。legacy-ticketing-schema.ts 和 legacy-identity-schema.ts 保存历史表元数据，防止生成误删表的迁移。它们没有运行入口和 SDK。旧身份绑定继续防止邮箱绕过，旧 OIDC 会话返回未登录。

M002 附件位于 UPLOAD_PATH，M015 在其 project-submissions 子目录。随机文件名、真实内容校验及引用授权保留；仅公开项目图片可匿名读，私有 PDF 不公开。public 只存公开资产。

## 主线边界

主线不含售票运行模块、OIDC SDK／实验、云存储或部署配置。分支归属见 BRANCHES-AND-PRS.md。数据、环境和未提交资料不随分支复制。
