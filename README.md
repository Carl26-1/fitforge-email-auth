# FitForge 邮箱账号系统

## 本地运行

```bash
npm install
npm start
```

访问：`http://localhost:3000/index.html`

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
PORT=3000
SESSION_SECRET=replace_with_a_long_random_secret
AUTH_PROXY_BASE_URL=
AUTH_USERS_FILE=./data/users.json
DATABASE_URL=
# DATABASE_SSL=false
CORS_ORIGIN=
# CROSS_SITE_COOKIE=true
EMAIL_FROM=
RESEND_API_KEY=
# RESEND_API_BASE=https://api.resend.com
```

说明：
- `SESSION_SECRET` 建议使用高强度随机字符串。
- `DATABASE_URL` 配置后使用 PostgreSQL 持久化账号数据（推荐生产环境）。
- 不配置 `DATABASE_URL` 时，回退本地 JSON 存储（仅开发使用）。
- `AUTH_PROXY_BASE_URL` 可把认证请求转发到外部持久化认证服务（用于避免部署变更导致账号丢失）。
- `EMAIL_FROM` 和 `RESEND_API_KEY` 用于邮箱验证码发送（Resend）。

## 账号接口

- `POST /api/auth/send-code`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

注册流程：
1. 先请求 `POST /api/auth/send-code` 发送验证码（10 分钟有效）。
2. 再请求 `POST /api/auth/register`，并携带 `verificationCode`（6 位）。

## 线上部署（Vercel）

项目当前线上主地址：
- `https://project-six-amber-28.vercel.app`

如需重新部署：

```bash
npx vercel --prod
```

说明：
- 当前方案为同域前后端，不需要前端额外配置 API 域名。
- 如果未来把前端和后端拆分部署，再配置 `CORS_ORIGIN` 与跨站 Cookie。
- 若要保证每次部署后账号不丢失，需配置 `DATABASE_URL` 或 `AUTH_PROXY_BASE_URL` 其中之一。
