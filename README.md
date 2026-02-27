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
```

说明：
- `SESSION_SECRET` 建议使用高强度随机字符串。
- `AUTH_USERS_FILE` 是本地用户库文件，默认在 `data/users.json`。

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
- 本地 JSON 用户库（便于本地开发）

## Render 免费层部署（固定域名）
项目已提供 `render.yaml`，可直接部署到 Render 免费 Web Service。

1. 把代码推到 GitHub 仓库。
2. 登录 Render，点击 `New +` -> `Blueprint`。
3. 选择你的 GitHub 仓库，Render 会读取 `render.yaml` 自动创建服务。
4. 等待构建完成，获得固定地址：`https://<service-name>.onrender.com`。

说明：
- 免费层会休眠，首次访问可能慢几秒。
- 用户数据当前存储在 `/tmp/fitforge-users.json`，实例重建后会丢失（免费层常见限制）。
