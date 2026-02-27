const SESSION_COOKIE_NAME = "fitforge_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();
let schemaReady = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return jsonResponse(200, { ok: true });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuthApi(request, env, url);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const fallbackRequest = new Request(new URL("/index.html", request.url), request);
    return env.ASSETS.fetch(fallbackRequest);
  }
};

async function handleAuthApi(request, env, url) {
  if (!env.DB) {
    return jsonResponse(500, { ok: false, message: "数据库未绑定。" });
  }

  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).trim().length < 16) {
    return jsonResponse(500, { ok: false, message: "SESSION_SECRET 未配置。" });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    await ensureSchema(env);

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return register(request, env);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return login(request, env);
    }
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      return session(request, env);
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return logout();
    }

    return jsonResponse(404, { ok: false, message: "接口不存在。" });
  } catch (error) {
    console.error("auth_api_error", error);
    return jsonResponse(500, { ok: false, message: "服务器错误，请稍后重试。" });
  }
}

async function ensureSchema(env) {
  if (schemaReady) {
    return;
  }

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL)"
  ).run();

  schemaReady = true;
}

async function register(request, env) {
  const body = await safeReadJson(request);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  const displayName = String(body?.displayName || "").trim().slice(0, 30);

  if (!isValidEmail(email)) {
    return jsonResponse(400, { ok: false, message: "邮箱格式不正确。" });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonResponse(400, { ok: false, message: passwordError });
  }

  const existing = await getUserByEmail(env, email);
  if (existing) {
    return jsonResponse(409, { ok: false, message: "该邮箱已注册，请直接登录。" });
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = toBase64Url(saltBytes);
  const hash = await hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString()
  };

  const inserted = await createUser(env, user);
  if (!inserted) {
    return jsonResponse(409, { ok: false, message: "该邮箱已注册，请直接登录。" });
  }

  const token = await signSessionToken(env, {
    uid: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  });

  return withSessionCookie(
    jsonResponse(200, {
      ok: true,
      emailMasked: maskEmail(user.email),
      displayLabel: buildDisplayLabel(user)
    }),
    token
  );
}

async function login(request, env) {
  const body = await safeReadJson(request);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");

  if (!isValidEmail(email)) {
    return jsonResponse(400, { ok: false, message: "邮箱格式不正确。" });
  }

  const user = await getUserByEmail(env, email);
  if (!user) {
    return jsonResponse(401, { ok: false, message: "邮箱或密码错误。" });
  }

  const hash = await hashPassword(password, user.passwordSalt);
  if (!timingSafeEqual(hash, user.passwordHash)) {
    return jsonResponse(401, { ok: false, message: "邮箱或密码错误。" });
  }

  const token = await signSessionToken(env, {
    uid: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  });

  return withSessionCookie(
    jsonResponse(200, {
      ok: true,
      emailMasked: maskEmail(user.email),
      displayLabel: buildDisplayLabel(user)
    }),
    token
  );
}

async function session(request, env) {
  const token = readCookie(request.headers.get("Cookie") || "", SESSION_COOKIE_NAME);
  if (!token) {
    return jsonResponse(401, { ok: false, loggedIn: false });
  }

  const claims = await verifySessionToken(env, token);
  if (!claims?.email) {
    return jsonResponse(401, { ok: false, loggedIn: false });
  }

  const user = await getUserByEmail(env, normalizeEmail(claims.email));
  if (!user) {
    return jsonResponse(401, { ok: false, loggedIn: false });
  }

  return jsonResponse(200, {
    ok: true,
    loggedIn: true,
    emailMasked: maskEmail(user.email),
    displayLabel: buildDisplayLabel(user)
  });
}

function logout() {
  const response = jsonResponse(200, { ok: true });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
  );
  return response;
}

async function getUserByEmail(env, email) {
  const row = await env.DB.prepare(
    `SELECT id, email, display_name, password_hash, password_salt, created_at
     FROM users
     WHERE email = ?
     LIMIT 1`
  ).bind(email).first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at
  };
}

async function createUser(env, user) {
  const result = await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO NOTHING`
  ).bind(
    user.id,
    user.email,
    user.displayName,
    user.passwordHash,
    user.passwordSalt,
    user.createdAt
  ).run();

  return Boolean(result.meta?.changes);
}

function validatePassword(password) {
  if (password.length < 8) {
    return "密码至少 8 位。";
  }
  if (password.length > 128) {
    return "密码长度不能超过 128 位。";
  }
  return "";
}

async function safeReadJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeEmail(emailInput) {
  return String(emailInput || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

async function hashPassword(password, saltBase64Url) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${password}:${saltBase64Url}`)
  );
  return toHex(new Uint8Array(digest));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signSessionToken(env, payload) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const content = `${header}.${body}`;
  const signature = await signHmacSha256(env.SESSION_SECRET, content);
  return `${content}.${signature}`;
}

async function verifySessionToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts;
  const content = `${header}.${body}`;
  const expected = await signHmacSha256(env.SESSION_SECRET, content);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function signHmacSha256(secret, content) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
  return toBase64Url(new Uint8Array(signature));
}

function readCookie(cookieHeader, name) {
  const target = `${name}=`;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(target)) {
      return decodeURIComponent(part.slice(target.length));
    }
  }
  return "";
}

function withSessionCookie(response, token) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
  return response;
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function toHex(bytes) {
  return Array.from(bytes).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(inputBytes) {
  let binary = "";
  for (const byte of inputBytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
