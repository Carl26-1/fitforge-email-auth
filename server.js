const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

const sessionCookieName = "fitforge_session";
const hasExplicitSessionSecret = Boolean(process.env.SESSION_SECRET);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const usersFilePath = process.env.AUTH_USERS_FILE || path.join(__dirname, "data", "users.json");

app.use(express.json());
app.use(cookieParser());
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
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionMaxAgeMs
  });
}

function findUserByEmail(users, email) {
  return users.find((item) => item.email === email);
}

app.post("/api/auth/register", (req, res) => {
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

  const users = readUsers();
  if (findUserByEmail(users, email)) {
    res.status(409).json({ ok: false, message: "该邮箱已注册，请直接登录。" });
    return;
  }

  const passwordDigest = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName,
    passwordHash: passwordDigest.hash,
    passwordSalt: passwordDigest.salt,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);

  const token = signSessionToken(user);
  setSessionCookie(res, token);

  res.json({
    ok: true,
    emailMasked: maskEmail(email),
    displayLabel: buildDisplayLabel(user)
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "邮箱格式不正确。" });
    return;
  }

  const users = readUsers();
  const user = findUserByEmail(users, email);
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
});

app.get("/api/auth/session", (req, res) => {
  const session = readSession(req);
  if (!session?.email) {
    res.status(401).json({ ok: false, loggedIn: false });
    return;
  }

  const users = readUsers();
  const user = findUserByEmail(users, normalizeEmail(session.email));
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
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  res.json({ ok: true });
});

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`FitForge server running at http://localhost:${port}`);
  if (!hasExplicitSessionSecret) {
    console.log("SESSION_SECRET not set. Using ephemeral secret for development.");
  }
  console.log(`User store: ${usersFilePath}`);
});
