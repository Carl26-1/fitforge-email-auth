const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const runningOnVercel = Boolean(process.env.VERCEL);
if (!runningOnVercel) {
  require("dotenv").config();
}

const app = express();
const port = Number(process.env.PORT || 3000);

const sessionCookieName = "fitforge_session";
const hasExplicitSessionSecret = Boolean(process.env.SESSION_SECRET);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const authProxyBaseUrl = String(process.env.AUTH_PROXY_BASE_URL || "").trim().replace(/\/+$/, "");
const useAuthProxy = Boolean(authProxyBaseUrl);
const usersFilePath = runningOnVercel
  ? path.join("/tmp", "fitforge-users.json")
  : (process.env.AUTH_USERS_FILE || path.join(__dirname, "data", "users.json"));
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const dbSslDisabled = String(process.env.DATABASE_SSL || "").trim().toLowerCase() === "false";
const usePostgres = Boolean(databaseUrl);
const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const hasCorsOrigins = corsOrigins.length > 0;
const forceCrossSiteCookie = String(process.env.CROSS_SITE_COOKIE || "").trim().toLowerCase() === "true";
const useCrossSiteCookie = hasCorsOrigins || forceCrossSiteCookie;

let pool = null;
if (usePostgres) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: dbSslDisabled ? false : { rejectUnauthorized: false }
  });
}

let storageReadyPromise = null;

app.use(express.json());
app.use(cookieParser());
app.use("/api", async (req, res, next) => {
  if (useAuthProxy) {
    next();
    return;
  }
  try {
    await ensureStorageReady();
    next();
  } catch (error) {
    next(error);
  }
});
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.static(path.join(__dirname)));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      ok: false,
      message: "请求体不是合法 JSON。"
    });
    return;
  }
  next(err);
});

function ensureUsersStore() {
  const dir = path.dirname(usersFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
  }
}

function readUsers() {
  ensureUsersStore();
  try {
    const raw = fs.readFileSync(usersFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureUsersStore();
  const tempFile = `${usersFilePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(tempFile, usersFilePath);
}

async function ensureStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = (async () => {
      if (usePostgres) {
        await initPostgresSchema();
      } else {
        ensureUsersStore();
      }
    })();
  }
  return storageReadyPromise;
}

async function initPostgresSchema() {
  if (!pool) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getUserByEmail(email) {
  if (!usePostgres) {
    const users = readUsers();
    return findUserByEmail(users, email) || null;
  }
  const result = await pool.query(
    `SELECT id, email, display_name, password_hash, password_salt, created_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  if (result.rowCount < 1) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at
  };
}

async function createUser({ id, email, displayName, passwordHash, passwordSalt, createdAt }) {
  if (!usePostgres) {
    const users = readUsers();
    users.push({
      id,
      email,
      displayName,
      passwordHash,
      passwordSalt,
      createdAt
    });
    writeUsers(users);
    return {
      id,
      email,
      displayName,
      passwordHash,
      passwordSalt,
      createdAt
    };
  }

  const result = await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, display_name, password_hash, password_salt, created_at`,
    [id, email, displayName, passwordHash, passwordSalt, createdAt]
  );

  if (result.rowCount < 1) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at
  };
}

function normalizeEmail(emailInput) {
  return String(emailInput || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  const text = String(password || "");
  if (text.length < 8) {
    return "密码至少 8 位。";
  }
  if (text.length > 128) {
    return "密码长度不能超过 128 位。";
  }
  return "";
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64);
  return {
    salt,
    hash: derived.toString("hex")
  };
}

function verifyPassword(password, hash, salt) {
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = Buffer.from(test, "hex");
  if (hashBuf.length !== testBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuf, testBuf);
}

function maskEmail(email) {
  const value = normalizeEmail(email);
  const at = value.indexOf("@");
  if (at <= 1) {
    return value || "unknown";
  }
  const name = value.slice(0, at);
  const domain = value.slice(at);
  return `${name[0]}***${name.slice(-1)}${domain}`;
}

function buildDisplayLabel(user) {
  const emailMasked = maskEmail(user.email);
  if (user.displayName) {
    return `${user.displayName} (${emailMasked})`;
  }
  return emailMasked;
}

function signSessionToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email },
    sessionSecret,
    { expiresIn: "7d" }
  );
}

function readSession(req) {
  const token = req.cookies[sessionCookieName];
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token, sessionSecret);
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secureCookie = process.env.NODE_ENV === "production" || useCrossSiteCookie;
  const sameSiteValue = useCrossSiteCookie ? "none" : "lax";
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: sameSiteValue,
    secure: secureCookie,
    maxAge: sessionMaxAgeMs
  });
}

function findUserByEmail(users, email) {
  return users.find((item) => item.email === email);
}

function getSetCookieHeaders(upstreamResponse) {
  if (typeof upstreamResponse.headers.getSetCookie === "function") {
    return upstreamResponse.headers.getSetCookie();
  }
  const single = upstreamResponse.headers.get("set-cookie");
  return single ? [single] : [];
}

async function proxyAuthRequest(req, res, pathName) {
  const targetUrl = `${authProxyBaseUrl}${pathName}`;
  const upstreamHeaders = {
    Accept: "application/json"
  };
  if (req.headers.cookie) {
    upstreamHeaders.Cookie = req.headers.cookie;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    upstreamHeaders["Content-Type"] = "application/json";
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: req.method,
    headers: upstreamHeaders,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body || {})
  });

  const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8";
  const setCookies = getSetCookieHeaders(upstreamResponse);
  setCookies.forEach((cookie) => res.append("Set-Cookie", cookie));
  res.status(upstreamResponse.status);
  res.set("Content-Type", contentType);
  const text = await upstreamResponse.text();
  res.send(text);
}

app.post("/api/auth/register", async (req, res) => {
  if (useAuthProxy) {
    try {
      await proxyAuthRequest(req, res, "/api/auth/register");
    } catch (error) {
      console.error("register_proxy_error", error);
      res.status(502).json({ ok: false, message: "认证服务暂不可用，请稍后重试。" });
    }
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const displayName = String(req.body?.displayName || "").trim().slice(0, 30);

  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "邮箱格式不正确。" });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ ok: false, message: passwordError });
    return;
  }

  try {
    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ ok: false, message: "该邮箱已注册，请直接登录。" });
      return;
    }

    const passwordDigest = hashPassword(password);
    const createdAt = new Date().toISOString();
    const created = await createUser({
      id: crypto.randomUUID(),
      email,
      displayName,
      passwordHash: passwordDigest.hash,
      passwordSalt: passwordDigest.salt,
      createdAt
    });
    if (!created) {
      res.status(409).json({ ok: false, message: "该邮箱已注册，请直接登录。" });
      return;
    }

    const token = signSessionToken(created);
    setSessionCookie(res, token);

    res.json({
      ok: true,
      emailMasked: maskEmail(email),
      displayLabel: buildDisplayLabel(created)
    });
  } catch (error) {
    console.error("register_error", error);
    res.status(500).json({ ok: false, message: "注册失败，请稍后重试。" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (useAuthProxy) {
    try {
      await proxyAuthRequest(req, res, "/api/auth/login");
    } catch (error) {
      console.error("login_proxy_error", error);
      res.status(502).json({ ok: false, message: "认证服务暂不可用，请稍后重试。" });
    }
    return;
  }

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "邮箱格式不正确。" });
    return;
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      res.status(401).json({ ok: false, message: "邮箱或密码错误。" });
      return;
    }

    const ok = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) {
      res.status(401).json({ ok: false, message: "邮箱或密码错误。" });
      return;
    }

    const token = signSessionToken(user);
    setSessionCookie(res, token);
    res.json({
      ok: true,
      emailMasked: maskEmail(user.email),
      displayLabel: buildDisplayLabel(user)
    });
  } catch (error) {
    console.error("login_error", error);
    res.status(500).json({ ok: false, message: "登录失败，请稍后重试。" });
  }
});

app.get("/api/auth/session", async (req, res) => {
  if (useAuthProxy) {
    try {
      await proxyAuthRequest(req, res, "/api/auth/session");
    } catch (error) {
      console.error("session_proxy_error", error);
      res.status(502).json({ ok: false, loggedIn: false });
    }
    return;
  }

  const session = readSession(req);
  if (!session?.email) {
    res.status(401).json({ ok: false, loggedIn: false });
    return;
  }

  try {
    const user = await getUserByEmail(normalizeEmail(session.email));
    if (!user) {
      res.status(401).json({ ok: false, loggedIn: false });
      return;
    }

    res.json({
      ok: true,
      loggedIn: true,
      emailMasked: maskEmail(user.email),
      displayLabel: buildDisplayLabel(user)
    });
  } catch (error) {
    console.error("session_error", error);
    res.status(500).json({ ok: false, loggedIn: false });
  }
});

app.post("/api/auth/logout", (req, res) => {
  if (useAuthProxy) {
    proxyAuthRequest(req, res, "/api/auth/logout").catch((error) => {
      console.error("logout_proxy_error", error);
      res.status(502).json({ ok: false, message: "认证服务暂不可用，请稍后重试。" });
    });
    return;
  }

  const secureCookie = process.env.NODE_ENV === "production" || useCrossSiteCookie;
  const sameSiteValue = useCrossSiteCookie ? "none" : "lax";
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: sameSiteValue,
    secure: secureCookie
  });
  res.json({ ok: true });
});

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function startServer() {
  if (!useAuthProxy) {
    await ensureStorageReady();
  }

  app.listen(port, () => {
    console.log(`FitForge server running at http://localhost:${port}`);
    if (!hasExplicitSessionSecret) {
      console.log("SESSION_SECRET not set. Using ephemeral secret for development.");
    }
    if (useAuthProxy) {
      console.log(`User store: Auth proxy (${authProxyBaseUrl})`);
    } else if (usePostgres) {
      console.log("User store: PostgreSQL (DATABASE_URL)");
    } else {
      console.log(`User store: ${usersFilePath}`);
    }
  });
}

if (runningOnVercel) {
  module.exports = app;
} else {
  startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}
