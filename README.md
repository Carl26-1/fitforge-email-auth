# FitForge 邮箱账号系统

## 安装
```bash
npm install
```

## 环境变量
复制 `.env.example` 为 `.env`：

```bash
PORT=3000
SESSION_SECRET=replace_with_a_long_random_secret
AUTH_USERS_FILE=./data/users.json
DATABASE_URL=
# DATABASE_SSL=false
```

说明：
- `SESSION_SECRET` 建议使用高强度随机字符串。
- `DATABASE_URL`：填写 PostgreSQL 连接串后，账号将存到云数据库（跨设备可用）。
- `AUTH_USERS_FILE`：当 `DATABASE_URL` 为空时，回退到本地 JSON 存储（仅开发或临时演示）。
- `DATABASE_SSL=false`：仅在你的数据库不支持 SSL 时配置（大多数云库不用改）。

## 启动
```bash
npm start
```

访问：
- `http://localhost:3000/index.html`

## 账号接口
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

## 注册字段
```json
{
  "email": "user@example.com",
  "password": "your_password",
  "displayName": "Alex"
}
```

## 特性
- 邮箱注册/登录
- 密码 `scrypt` 加密存储
- HttpOnly Cookie 会话
- PostgreSQL 持久化用户库（可跨设备登录）
- 本地 JSON 回退模式（便于本地开发）

## Render 免费层部署（固定域名）
项目已提供 `render.yaml`，可直接部署到 Render 免费 Web Service。

1. 把代码推到 GitHub 仓库。
2. 登录 Render，点击 `New +` -> `Blueprint`。
3. 选择你的 GitHub 仓库，Render 会读取 `render.yaml` 自动创建服务。
4. 在 Render 服务 `Environment` 中设置 `DATABASE_URL`（推荐用 Supabase/Neon 免费 PostgreSQL）。
5. 等待构建完成，获得固定地址：`https://<service-name>.onrender.com`。

说明：
- 免费层会休眠，首次访问可能慢几秒。
- 若已配置 `DATABASE_URL`，账号数据将持久化，不会因为实例重建丢失。
- 若未配置 `DATABASE_URL`，会使用 `/tmp/fitforge-users.json`，重建后可能丢失。
