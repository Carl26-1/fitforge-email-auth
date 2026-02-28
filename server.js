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
const emailCodeCookieName = "fitforge_email_code";
const hasExplicitSessionSecret = Boolean(process.env.SESSION_SECRET);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const emailCodeTtlMs = 10 * 60 * 1000;
const emailCodeCooldownMs = 60 * 1000;
const emailCodeWindowMs = 10 * 60 * 1000;
const emailCodeMaxPerWindow = 6;
const authProxyBaseUrl = String(process.env.AUTH_PROXY_BASE_URL || "").trim().replace(/\/+$/, "");
const configuredSiteUrl = String(process.env.SITE_URL || "https://project-six-amber-28.vercel.app")
  .trim()
  .replace(/\/+$/, "");
const resendApiBase = String(process.env.RESEND_API_BASE || "https://api.resend.com")
  .trim()
  .replace(/\/+$/, "");
const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
const emailFromAddress = String(process.env.EMAIL_FROM || "").trim();
const allowUnsafeCodeFallback = String(process.env.ALLOW_UNSAFE_CODE_FALLBACK || "false").trim().toLowerCase() === "true";
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
const emailCodeRateByEmail = new Map();
const emailCodeRateByIp = new Map();

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

function setEmailCodeCookie(res, token) {
  const secureCookie = process.env.NODE_ENV === "production" || useCrossSiteCookie;
  const sameSiteValue = useCrossSiteCookie ? "none" : "lax";
  res.cookie(emailCodeCookieName, token, {
    httpOnly: true,
    sameSite: sameSiteValue,
    secure: secureCookie,
    maxAge: emailCodeTtlMs
  });
}

function clearEmailCodeCookie(res) {
  const secureCookie = process.env.NODE_ENV === "production" || useCrossSiteCookie;
  const sameSiteValue = useCrossSiteCookie ? "none" : "lax";
  res.clearCookie(emailCodeCookieName, {
    httpOnly: true,
    sameSite: sameSiteValue,
    secure: secureCookie
  });
}

function readEmailCodeSession(req) {
  const token = req.cookies[emailCodeCookieName];
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token, sessionSecret);
  } catch {
    return null;
  }
}

function hashEmailCode(email, code, nonce) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${String(code)}:${String(nonce)}:${sessionSecret}`)
    .digest("hex");
}

function secureEqual(left, right) {
  const leftBuf = Buffer.from(String(left || ""), "utf8");
  const rightBuf = Buffer.from(String(right || ""), "utf8");
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0];
  return forwarded || req.ip || "unknown";
}

function takeRateToken(rateMap, key, { windowMs, limit, now }) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    return { ok: true, retryAfterSec: 0 };
  }

  const existing = rateMap.get(safeKey);
  if (!existing || now - existing.windowStart > windowMs) {
    rateMap.set(safeKey, {
      windowStart: now,
      count: 1
    });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    const retryMs = Math.max(1000, windowMs - (now - existing.windowStart));
    return {
      ok: false,
      retryAfterSec: Math.ceil(retryMs / 1000)
    };
  }

  existing.count += 1;
  rateMap.set(safeKey, existing);
  return { ok: true, retryAfterSec: 0 };
}

function checkEmailCooldown(email, now) {
  const key = normalizeEmail(email);
  const existing = emailCodeRateByEmail.get(key);
  if (!existing?.lastSentAt) {
    return { ok: true, retryAfterSec: 0 };
  }
  const elapsed = now - existing.lastSentAt;
  if (elapsed >= emailCodeCooldownMs) {
    return { ok: true, retryAfterSec: 0 };
  }
  return {
    ok: false,
    retryAfterSec: Math.ceil((emailCodeCooldownMs - elapsed) / 1000)
  };
}

function markEmailSent(email, now) {
  const key = normalizeEmail(email);
  const existing = emailCodeRateByEmail.get(key) || { windowStart: now, count: 0 };
  existing.lastSentAt = now;
  emailCodeRateByEmail.set(key, existing);
}

function assertEmailProviderReady() {
  if (!emailFromAddress || !resendApiKey) {
    throw new Error("邮件服务未配置，请在 .env 设置 EMAIL_FROM 与 RESEND_API_KEY。");
  }
}

async function sendRegisterEmailCode(email, code) {
  assertEmailProviderReady();
  const response = await fetch(`${resendApiBase}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: emailFromAddress,
      to: [email],
      subject: "FitForge 注册验证码",
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#111">
          <h2 style="margin:0 0 12px">FitForge 邮箱验证码</h2>
          <p style="margin:0 0 10px">你的注册验证码是：</p>
          <p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:0 0 10px">${code}</p>
          <p style="margin:0;color:#555">10 分钟内有效。如非本人操作，请忽略此邮件。</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`邮件发送失败（${response.status}）${detail ? `: ${detail}` : ""}`);
  }
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

function resolveSiteUrl(req) {
  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").trim();
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }
  return "https://project-six-amber-28.vercel.app";
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

app.post("/api/auth/send-code", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "邮箱格式不正确。" });
    return;
  }

  try {
    if (!useAuthProxy) {
      const existing = await getUserByEmail(email);
      if (existing) {
        res.status(409).json({ ok: false, message: "该邮箱已注册，请直接登录。" });
        return;
      }
    }

    const now = Date.now();
    const cooldown = checkEmailCooldown(email, now);
    if (!cooldown.ok) {
      res.status(429).json({
        ok: false,
        message: `发送过于频繁，请 ${cooldown.retryAfterSec} 秒后再试。`
      });
      return;
    }

    const emailToken = takeRateToken(emailCodeRateByEmail, email, {
      windowMs: emailCodeWindowMs,
      limit: emailCodeMaxPerWindow,
      now
    });
    if (!emailToken.ok) {
      res.status(429).json({
        ok: false,
        message: `该邮箱发送次数过多，请 ${emailToken.retryAfterSec} 秒后再试。`
      });
      return;
    }

    const ipToken = takeRateToken(emailCodeRateByIp, getClientIp(req), {
      windowMs: emailCodeWindowMs,
      limit: emailCodeMaxPerWindow * 2,
      now
    });
    if (!ipToken.ok) {
      res.status(429).json({
        ok: false,
        message: `请求过于频繁，请 ${ipToken.retryAfterSec} 秒后再试。`
      });
      return;
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const nonce = crypto.randomBytes(8).toString("hex");
    const codeHash = hashEmailCode(email, code, nonce);
    const token = jwt.sign(
      {
        purpose: "register",
        email,
        nonce,
        codeHash
      },
      sessionSecret,
      { expiresIn: Math.floor(emailCodeTtlMs / 1000) }
    );

    const canSendEmail = Boolean(emailFromAddress && resendApiKey);
    if (canSendEmail) {
      await sendRegisterEmailCode(email, code);
    } else if (!allowUnsafeCodeFallback) {
      res.status(503).json({ ok: false, message: "邮件服务未配置，请在 .env 设置 EMAIL_FROM 与 RESEND_API_KEY。" });
      return;
    }

    setEmailCodeCookie(res, token);
    markEmailSent(email, now);

    const payload = {
      ok: true,
      emailMasked: maskEmail(email),
      cooldownSec: Math.floor(emailCodeCooldownMs / 1000),
      expiresInSec: Math.floor(emailCodeTtlMs / 1000)
    };
    if (!canSendEmail) {
      payload.delivery = "onscreen";
      payload.debugCode = code;
      payload.warning = "当前为临时验证码模式，验证码仅在页面显示。";
    } else {
      payload.delivery = "email";
    }
    res.json(payload);
  } catch (error) {
    console.error("send_code_error", error);
    const message = String(error?.message || "");
    if (message.includes("邮件服务未配置")) {
      res.status(503).json({ ok: false, message });
      return;
    }
    res.status(502).json({ ok: false, message: "验证码发送失败，请稍后重试。" });
  }
});

app.post("/api/auth/register", async (req, res) => {
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
    if (useAuthProxy) {
      const targetUrl = `${authProxyBaseUrl}/api/auth/register`;
      const upstreamHeaders = {
        Accept: "application/json",
        "Content-Type": "application/json"
      };
      if (req.headers.cookie) {
        upstreamHeaders.Cookie = req.headers.cookie;
      }

      const upstreamResponse = await fetch(targetUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify({
          email,
          password,
          displayName
        })
      });

      const setCookies = getSetCookieHeaders(upstreamResponse);
      setCookies.forEach((cookie) => res.append("Set-Cookie", cookie));
      res.status(upstreamResponse.status);
      res.set("Content-Type", upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8");
      res.send(await upstreamResponse.text());
      return;
    }

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

app.get("/robots.txt", (req, res) => {
  const baseUrl = resolveSiteUrl(req);
  const robots = [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${baseUrl}/sitemap.xml`
  ].join("\n");
  res.type("text/plain").send(robots);
});

app.get("/sitemap.xml", (req, res) => {
  const baseUrl = resolveSiteUrl(req);
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  res.type("application/xml").send(xml);
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
