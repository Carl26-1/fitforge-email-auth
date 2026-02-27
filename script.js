const form = document.getElementById("plan-form");
const result = document.getElementById("result");
const appShell = document.getElementById("app-shell");
const authShell = document.getElementById("auth-shell");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const displayNameInput = document.getElementById("display-name");
const confirmPasswordInput = document.getElementById("confirm-password");
const authHint = document.getElementById("auth-hint");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const modeLoginBtn = document.getElementById("mode-login-btn");
const modeRegisterBtn = document.getElementById("mode-register-btn");
const registerNameRow = document.getElementById("register-name-row");
const registerConfirmRow = document.getElementById("register-confirm-row");
const logoutBtn = document.getElementById("logout-btn");
const sessionEmail = document.getElementById("session-email");
const goalSelect = document.getElementById("goal");
const customGoalWrapper = document.getElementById("custom-goal-wrapper");
const customGoalInput = document.getElementById("custom-goal");
const planSubmitBtn = form?.querySelector('button[type="submit"]');
const isGithubPages = window.location.hostname.endsWith("github.io");
const configuredApiBase = String(window.FITFORGE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const apiBaseUrl = configuredApiBase;
let authMode = "login";
let useLocalAuth = window.location.protocol === "file:";
let authSubmitting = false;
let planGenerating = false;
const LOCAL_USERS_KEY = "fitforge_local_users_v1";
const LOCAL_SESSION_KEY = "fitforge_local_session_v1";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const trainingDayPatterns = {
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 3, 4, 5, 6]
};
const levelStandards = {
  beginner: "新手：系统训练通常不足 6 个月，基础动作模式（蹲/髋铰链/推/拉）尚不稳定。",
  intermediate: "进阶：系统训练约 6-24 个月，主要动作技术稳定，能连续 8-12 周按计划训练与加负荷。",
  advanced: "高级：系统训练超过 24 个月，动作效率高，能按周期化管理训练量、强度与恢复。"
};

const mealTemplates = {
  balanced: {
    label: "均衡饮食",
    meals: [
      { name: "早餐", detail: "燕麦 + 牛奶/豆奶 + 鸡蛋 + 一份水果" },
      { name: "午餐", detail: "米饭/杂粮 + 鸡胸/鱼肉 + 两份蔬菜" },
      { name: "训练后", detail: "酸奶或蛋白奶昔 + 香蕉" },
      { name: "晚餐", detail: "红薯/藜麦 + 瘦肉/豆腐 + 绿叶菜" }
    ]
  },
  "high-protein": {
    label: "高蛋白优先",
    meals: [
      { name: "早餐", detail: "全麦面包 + 鸡蛋 2 个 + 希腊酸奶" },
      { name: "午餐", detail: "米饭 + 牛肉/鸡腿肉 + 蔬菜 + 豆制品" },
      { name: "训练后", detail: "乳清蛋白 + 水果 + 米饼" },
      { name: "晚餐", detail: "三文鱼/虾 + 藜麦 + 蔬菜沙拉" }
    ]
  },
  vegetarian: {
    label: "素食友好",
    meals: [
      { name: "早餐", detail: "豆浆 + 全麦吐司 + 花生酱 + 水果" },
      { name: "午餐", detail: "糙米 + 豆腐/天贝 + 菌菇蔬菜" },
      { name: "训练后", detail: "豌豆蛋白粉 + 香蕉或葡萄" },
      { name: "晚餐", detail: "红薯 + 鹰嘴豆沙拉 + 西兰花" }
    ]
  }
};

const goalProfiles = {
  "fat-loss": {
    label: "减脂塑形",
    planKey: "fat-loss",
    calorieDelta: -350,
    proteinPerKg: 2.0,
    fatPerKg: 0.8
  },
  "muscle-gain": {
    label: "增肌增力",
    planKey: "muscle-gain",
    calorieDelta: 220,
    proteinPerKg: 2.0,
    fatPerKg: 0.9
  },
  endurance: {
    label: "提升耐力",
    planKey: "endurance",
    calorieDelta: 120,
    proteinPerKg: 1.6,
    fatPerKg: 0.8
  },
  strength: {
    label: "提升力量",
    planKey: "muscle-gain",
    calorieDelta: 160,
    proteinPerKg: 2.0,
    fatPerKg: 0.9
  },
  recomp: {
    label: "体态重塑",
    planKey: "fat-loss",
    calorieDelta: -120,
    proteinPerKg: 2.1,
    fatPerKg: 0.8
  },
  "general-fitness": {
    label: "提升健康体能",
    planKey: "endurance",
    calorieDelta: 0,
    proteinPerKg: 1.8,
    fatPerKg: 0.8
  },
  mobility: {
    label: "灵活性与体态改善",
    planKey: "endurance",
    calorieDelta: -80,
    proteinPerKg: 1.6,
    fatPerKg: 0.8
  },
  custom: {
    label: "自定义目标",
    planKey: "fat-loss",
    calorieDelta: 0,
    proteinPerKg: 1.9,
    fatPerKg: 0.8
  }
};

const plans = {
  "fat-loss": {
    title: "减脂塑形",
    acsmCardioTarget: "200-300 分钟/周中等强度有氧 + 每周至少 2 天抗阻",
    nscaFocus: "力量维持 + 代谢训练组合，避免只做有氧",
    catalog: {
      strength_a: {
        name: "全身力量 A",
        type: "strength",
        home: ["高脚杯深蹲", "俯卧撑", "弹力带划船", "臀桥", "平板支撑"],
        gym: ["杠铃深蹲", "哑铃卧推", "坐姿划船", "罗马尼亚硬拉", "卷腹机"]
      },
      cardio_zone2: {
        name: "Zone2 稳态有氧",
        type: "cardio_zone2",
        home: ["快走或慢跑", "跳绳轻中强度", "动态拉伸"],
        gym: ["跑步机坡走", "椭圆机稳态", "动感单车稳态"]
      },
      strength_b: {
        name: "全身力量 B",
        type: "strength",
        home: ["分腿蹲", "哑铃肩推", "哑铃罗马尼亚硬拉", "弹力带下拉", "侧桥"],
        gym: ["腿举", "哑铃肩推", "高位下拉", "臀推", "悬垂举腿"]
      },
      hiit: {
        name: "间歇训练",
        type: "cardio_interval",
        home: ["20-30 秒冲刺 + 60 秒恢复 x 多组", "登山跑", "低强度放松走"],
        gym: ["跑步机冲刺间歇", "单车冲刺间歇", "划船机间歇"]
      },
      metcon: {
        name: "代谢循环",
        type: "metabolic",
        home: ["徒手深蹲", "俯卧撑", "弓步走", "平板支撑", "波比跳（可替代）"],
        gym: ["壶铃摆动", "药球砸地", "战绳", "划船机 250m", "农夫行走"]
      },
      recovery: {
        name: "主动恢复",
        type: "recovery",
        home: ["20-30 分钟轻松步行", "髋/踝/胸椎灵活性", "呼吸放松"],
        gym: ["自行车低强度", "拉伸区灵活性", "泡沫轴放松"]
      }
    },
    split: {
      2: ["strength_a", "cardio_zone2"],
      3: ["strength_a", "cardio_zone2", "strength_b"],
      4: ["strength_a", "cardio_zone2", "strength_b", "hiit"],
      5: ["strength_a", "cardio_zone2", "strength_b", "hiit", "metcon"],
      6: ["strength_a", "cardio_zone2", "strength_b", "hiit", "metcon", "recovery"]
    }
  },
  "muscle-gain": {
    title: "增肌增力",
    acsmCardioTarget: "每周 90-150 分钟低到中等强度有氧，保证恢复",
    nscaFocus: "周期化抗阻训练，主动作高质量渐进超负荷",
    catalog: {
      upper_push: {
        name: "上肢推",
        type: "hypertrophy",
        home: ["俯卧撑变式", "哑铃上斜卧推", "哑铃肩推", "侧平举", "臂屈伸"],
        gym: ["杠铃卧推", "上斜哑铃卧推", "坐姿肩推", "绳索夹胸", "绳索下压"]
      },
      lower: {
        name: "下肢力量",
        type: "strength",
        home: ["高脚杯深蹲", "保加利亚分腿蹲", "哑铃硬拉", "臀桥", "提踵"],
        gym: ["杠铃深蹲", "罗马尼亚硬拉", "腿举", "腿弯举", "提踵"]
      },
      upper_pull: {
        name: "上肢拉",
        type: "hypertrophy",
        home: ["弹力带划船", "单臂哑铃划船", "俯身反向飞鸟", "哑铃弯举", "死虫式"],
        gym: ["高位下拉", "坐姿划船", "面拉", "哑铃弯举", "悬垂举腿"]
      },
      lower_posterior: {
        name: "后链强化",
        type: "strength",
        home: ["哑铃罗马尼亚硬拉", "台阶蹬踏", "臀桥停顿", "弓步蹲", "侧桥"],
        gym: ["硬拉", "臀推", "腿后侧弯举", "行走箭步蹲", "腹轮/卷腹"]
      },
      hypertrophy_full: {
        name: "全身增肌补量",
        type: "hypertrophy",
        home: ["深蹲", "俯卧撑", "哑铃划船", "哑铃肩推", "核心循环"],
        gym: ["器械推胸", "器械划船", "腿举", "侧平举", "绳索卷腹"]
      },
      zone1_recovery: {
        name: "恢复有氧",
        type: "cardio_zone1",
        home: ["轻松步行 25-35 分钟", "髋/胸椎灵活性"],
        gym: ["单车或椭圆机轻松骑行", "拉伸放松"]
      }
    },
    split: {
      2: ["upper_push", "lower"],
      3: ["upper_push", "lower", "upper_pull"],
      4: ["upper_push", "lower", "upper_pull", "lower_posterior"],
      5: ["upper_push", "lower", "upper_pull", "lower_posterior", "hypertrophy_full"],
      6: ["upper_push", "lower", "upper_pull", "lower_posterior", "hypertrophy_full", "zone1_recovery"]
    }
  },
  endurance: {
    title: "提升耐力",
    acsmCardioTarget: "150-300 分钟/周有氧，含 1-2 次间歇刺激",
    nscaFocus: "有氧主导，配合 2 天力量维持运动经济性",
    catalog: {
      zone2_base: {
        name: "有氧基础 (Zone2)",
        type: "cardio_zone2",
        home: ["慢跑/快走 35-60 分钟", "动态热身", "放松走"],
        gym: ["跑步机 Zone2", "椭圆机 Zone2", "动感单车 Zone2"]
      },
      strength_support_a: {
        name: "力量支持 A",
        type: "strength_endurance",
        home: ["徒手深蹲", "俯卧撑", "弹力带划船", "臀桥", "平板支撑"],
        gym: ["腿举", "坐姿推胸", "坐姿划船", "臀推", "核心抗旋转"]
      },
      interval_threshold: {
        name: "阈值/间歇",
        type: "cardio_interval",
        home: ["4-8 分钟阈值段 x 2-4 组", "组间慢走恢复", "整理活动"],
        gym: ["跑步机阈值跑", "划船机间歇", "单车阈值间歇"]
      },
      strength_support_b: {
        name: "力量支持 B",
        type: "strength_endurance",
        home: ["分腿蹲", "哑铃硬拉", "肩推", "单臂划船", "侧桥"],
        gym: ["保加利亚分腿蹲", "罗马尼亚硬拉", "肩推", "下拉", "核心循环"]
      },
      long_slow: {
        name: "长距离低强度",
        type: "cardio_long",
        home: ["60-90 分钟低强度耐力", "补水与补给练习"],
        gym: ["长时间单车/跑步机", "配速稳定控制"]
      },
      recovery_mobility: {
        name: "恢复与灵活性",
        type: "recovery",
        home: ["20-30 分钟恢复步行", "全身拉伸", "呼吸练习"],
        gym: ["低强度单车", "泡沫轴", "关节活动度练习"]
      }
    },
    split: {
      2: ["zone2_base", "strength_support_a"],
      3: ["zone2_base", "strength_support_a", "interval_threshold"],
      4: ["zone2_base", "strength_support_a", "interval_threshold", "strength_support_b"],
      5: ["zone2_base", "strength_support_a", "interval_threshold", "strength_support_b", "long_slow"],
      6: ["zone2_base", "strength_support_a", "interval_threshold", "strength_support_b", "long_slow", "recovery_mobility"]
    }
  }
};

function levelLabel(level) {
  return {
    beginner: "新手",
    intermediate: "进阶",
    advanced: "高级"
  }[level];
}

function getLevelStandard(level) {
  return levelStandards[level] || levelStandards.beginner;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function maskEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  const atIndex = value.indexOf("@");
  if (atIndex <= 1) {
    return value || "unknown";
  }
  const name = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  return `${name[0]}***${name.slice(-1)}${domain}`;
}

function defaultAuthHint() {
  if (useLocalAuth) {
    return "当前为本地模式（仅当前设备可用）。";
  }
  return "请输入邮箱和密码进行登录。";
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (apiBaseUrl && path.startsWith("/")) {
    return `${apiBaseUrl}${path}`;
  }
  return path;
}

function switchToLocalAuth(reason = "cloud_unavailable") {
  if (useLocalAuth) {
    return;
  }
  useLocalAuth = true;
  switchToAuth();
  if (reason === "cloud_unavailable") {
    authHint.textContent = "云端账号服务暂不可用，已切换到本地模式（仅当前设备）。";
  }
}

function getLocalUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    const users = raw ? JSON.parse(raw) : [];
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function getLocalSessionEmail() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return session?.email ? String(session.email).trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

function setLocalSessionEmail(email) {
  localStorage.setItem(
    LOCAL_SESSION_KEY,
    JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      loginAt: Date.now()
    })
  );
}

function clearLocalSessionEmail() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function buildDisplayLabel(user, fallbackEmail) {
  const displayName = String(user?.displayName || "").trim();
  return displayName || maskEmail(fallbackEmail);
}

function localRegister({ email, password, displayName }) {
  const users = getLocalUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error("该邮箱已注册，请直接登录。");
  }

  users.push({
    email,
    password,
    displayName: String(displayName || "").trim(),
    createdAt: Date.now()
  });
  saveLocalUsers(users);
  setLocalSessionEmail(email);

  const created = users.find((user) => user.email === email);
  return {
    displayLabel: buildDisplayLabel(created, email),
    emailMasked: maskEmail(email)
  };
}

function localLogin({ email, password }) {
  const users = getLocalUsers();
  const user = users.find((item) => item.email === email);
  if (!user || user.password !== password) {
    throw new Error("邮箱或密码错误。");
  }
  setLocalSessionEmail(email);
  return {
    displayLabel: buildDisplayLabel(user, email),
    emailMasked: maskEmail(email)
  };
}

function localSession() {
  const email = getLocalSessionEmail();
  if (!email) {
    return { loggedIn: false };
  }

  const users = getLocalUsers();
  const user = users.find((item) => item.email === email);
  if (!user) {
    clearLocalSessionEmail();
    return { loggedIn: false };
  }

  return {
    loggedIn: true,
    displayLabel: buildDisplayLabel(user, email),
    emailMasked: maskEmail(email)
  };
}

async function apiRequest(url, options = {}) {
  const {
    timeoutMs = 12000,
    headers: customHeaders = {},
    ...restOptions
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response = null;

  try {
    response = await fetch(buildApiUrl(url), {
      credentials: "include",
      ...restOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...customHeaders
      }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { response, payload };
}

function switchToApp(userLabel) {
  authShell.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  const modeLabel = useLocalAuth ? "本地模式" : "云端模式";
  sessionEmail.textContent = `已登录账号：${userLabel}（${modeLabel}）`;
}

function switchToAuth() {
  appShell.classList.add("is-hidden");
  authShell.classList.remove("is-hidden");
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  authHint.textContent = authMode === "register" ? "请填写信息完成注册。" : defaultAuthHint();
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const isRegister = authMode === "register";
  registerNameRow.classList.toggle("is-hidden", !isRegister);
  registerConfirmRow.classList.toggle("is-hidden", !isRegister);
  displayNameInput.required = false;
  confirmPasswordInput.required = isRegister;
  passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
  authSubmitBtn.textContent = isRegister ? "注册并进入" : "登录并进入";
  modeLoginBtn.classList.toggle("is-active", !isRegister);
  modeRegisterBtn.classList.toggle("is-active", isRegister);
  authHint.textContent = isRegister ? "请填写信息完成注册。" : defaultAuthHint();
}

function setAuthSubmittingState(isSubmitting) {
  authSubmitting = Boolean(isSubmitting);
  const disabled = authSubmitting;
  authSubmitBtn.disabled = disabled;
  modeLoginBtn.disabled = disabled;
  modeRegisterBtn.disabled = disabled;
  emailInput.disabled = disabled;
  passwordInput.disabled = disabled;
  displayNameInput.disabled = disabled;
  confirmPasswordInput.disabled = disabled;
  authSubmitBtn.textContent = disabled
    ? (authMode === "register" ? "注册中..." : "登录中...")
    : (authMode === "register" ? "注册并进入" : "登录并进入");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (authSubmitting) {
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!isValidEmail(email)) {
    authHint.textContent = "邮箱格式不正确，请检查后重试。";
    return;
  }
  if (password.length < 8) {
    authHint.textContent = "密码至少 8 位。";
    return;
  }

  setAuthSubmittingState(true);
  try {
    if (authMode === "register" && password !== confirmPasswordInput.value) {
      authHint.textContent = "两次输入的密码不一致。";
      return;
    }

    let payload = null;
    if (useLocalAuth) {
      payload = authMode === "register"
        ? localRegister({
          email,
          password,
          displayName: displayNameInput.value.trim()
        })
        : localLogin({ email, password });
    } else {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const apiResult = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          displayName: displayNameInput.value.trim()
        })
      });
      if (!apiResult.response.ok) {
        if (apiResult.response.status === 404 && isGithubPages) {
          switchToLocalAuth("cloud_unavailable");
          return;
        }
        throw new Error(apiResult.payload?.message || (authMode === "register" ? "注册失败。" : "登录失败。"));
      }
      payload = apiResult.payload;
    }

    passwordInput.value = "";
    confirmPasswordInput.value = "";
    switchToApp(payload?.displayLabel || payload?.emailMasked || maskEmail(email));
  } catch (error) {
    if (!useLocalAuth && isGithubPages && !apiBaseUrl) {
      switchToLocalAuth("cloud_unavailable");
      return;
    }
    authHint.textContent = error.message || "操作失败，请重试。";
  } finally {
    setAuthSubmittingState(false);
  }
}

async function handleLogout() {
  if (logoutBtn.disabled) {
    return;
  }
  logoutBtn.disabled = true;
  if (useLocalAuth) {
    clearLocalSessionEmail();
  } else {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout; force local UI reset.
    }
  }
  switchToAuth();
  logoutBtn.disabled = false;
}

async function initAuth() {
  if (useLocalAuth) {
    const session = localSession();
    if (!session.loggedIn) {
      switchToAuth();
      return;
    }
    switchToApp(session.displayLabel || session.emailMasked || "已登录用户");
    return;
  }

  try {
    const { response, payload } = await apiRequest("/api/auth/session", {
      method: "GET"
    });
    if (isGithubPages && response.status === 404) {
      switchToLocalAuth("cloud_unavailable");
      return;
    }
    if (!response.ok || !payload?.loggedIn) {
      switchToAuth();
      return;
    }
    switchToApp(payload.displayLabel || payload.emailMasked || "已登录用户");
  } catch {
    if (isGithubPages) {
      switchToLocalAuth("cloud_unavailable");
      return;
    }
    switchToAuth();
  }
}

function inferPlanKeyFromCustomGoal(customGoal) {
  const text = customGoal.trim().toLowerCase();
  if (!text) {
    return "fat-loss";
  }
  if (/(力量|增肌|肌肥大|爆发|power|strength)/i.test(text)) {
    return "muscle-gain";
  }
  if (/(耐力|跑步|马拉松|心肺|有氧|endurance|cardio)/i.test(text)) {
    return "endurance";
  }
  if (/(减脂|减重|瘦|塑形|体脂|fat|weight)/i.test(text)) {
    return "fat-loss";
  }
  return "fat-loss";
}

function resolveGoalProfile(values) {
  const selectedProfile = goalProfiles[values.goal] || goalProfiles["fat-loss"];
  if (values.goal !== "custom") {
    return {
      ...selectedProfile,
      displayLabel: selectedProfile.label
    };
  }

  const customText = String(values.customGoal || "").trim();
  const inferredPlanKey = inferPlanKeyFromCustomGoal(customText);
  return {
    ...selectedProfile,
    planKey: inferredPlanKey,
    displayLabel: customText ? `自定义：${customText}` : selectedProfile.label
  };
}

function getNasmPhase(level, goal) {
  if (level === "beginner") {
    return "Phase 1（稳定耐力）：优先动作控制、关节稳定和技术建立";
  }
  if (level === "intermediate") {
    return "Phase 2（力量耐力）：主动作与稳定性动作组合，提高工作容量";
  }
  if (goal === "muscle-gain") {
    return "Phase 2 + Phase 3（肥大）：以增肌为主，并保留稳定性训练";
  }
  return "Phase 2 为主，周期性插入 Phase 1 作为恢复周";
}

function getAceZoneGuideline(level) {
  if (level === "beginner") {
    return "以 Zone 1-2 为主（RPE 3-5，可完整对话）";
  }
  if (level === "intermediate") {
    return "Zone 1-2 为主，配 1 次 Zone 3 间歇（RPE 6-7）";
  }
  return "每周 1-2 次 Zone 3，其他课保持 Zone 1-2 促进恢复";
}

function getNscaStrengthPrescription(level) {
  return {
    beginner: {
      structure: "主动作 3-5 组 x 4-6 次；辅助动作 2-3 组 x 6-8 次",
      intensity: "主动作约 80-88% 1RM（RPE 7-8）",
      rest: "主动作 2-4 分钟；辅助 90-150 秒"
    },
    intermediate: {
      structure: "主动作 4-6 组 x 3-5 次；辅助动作 3-4 组 x 5-6 次",
      intensity: "主动作约 82-92% 1RM（RPE 7.5-9）",
      rest: "主动作 3-5 分钟；辅助 2-3 分钟"
    },
    advanced: {
      structure: "主动作 4-8 组 x 1-4 次；辅助动作 3-5 组 x 3-5 次",
      intensity: "主动作约 85-100% 1RM（RPE 8-9.5）",
      rest: "主动作 3-5 分钟；辅助 2-3 分钟"
    }
  }[level];
}

function getPrescription(goalPlanKey, selectedGoal, level, sessionType) {
  if (
    selectedGoal === "strength" &&
    (sessionType === "strength" || sessionType === "hypertrophy" || sessionType === "strength_endurance")
  ) {
    return getNscaStrengthPrescription(level);
  }

  if (sessionType === "recovery") {
    return {
      structure: "20-35 分钟低强度恢复 + 10 分钟灵活性",
      intensity: "RPE 2-3",
      rest: "以呼吸和动作质量为先"
    };
  }

  if (sessionType === "cardio_zone1") {
    return {
      structure: "25-40 分钟稳态有氧",
      intensity: "RPE 3-4",
      rest: "全程连续，结束后拉伸"
    };
  }

  if (sessionType === "cardio_zone2") {
    return {
      structure: "30-60 分钟稳态有氧",
      intensity: "RPE 4-6（可说短句）",
      rest: "全程连续，结束后 5 分钟降速"
    };
  }

  if (sessionType === "cardio_interval") {
    const workRest = {
      beginner: "工作:恢复 = 1:2，做 6-8 组",
      intermediate: "工作:恢复 = 1:1，做 7-10 组",
      advanced: "工作:恢复 = 2:1 或阈值段 2-4 组"
    }[level];
    return {
      structure: `间歇有氧，${workRest}`,
      intensity: "工作段 RPE 7-8，恢复段 RPE 2-3",
      rest: "间歇段按计划恢复"
    };
  }

  if (sessionType === "cardio_long") {
    return {
      structure: "60-90 分钟低强度耐力",
      intensity: "RPE 4-5",
      rest: "保持稳定配速，必要时短暂停水"
    };
  }

  if (sessionType === "metabolic") {
    const structure = {
      beginner: "4-5 个动作循环，30 秒练/30 秒休，3 轮",
      intermediate: "5-6 个动作循环，40 秒练/20 秒休，4 轮",
      advanced: "6 个动作循环，45 秒练/15 秒休，4-5 轮"
    }[level];
    return {
      structure,
      intensity: "RPE 6-8，动作优先于速度",
      rest: "每轮间休 90-120 秒"
    };
  }

  if (sessionType === "hypertrophy") {
    const structure = {
      beginner: "每动作 2-3 组 x 8-12 次",
      intermediate: "每动作 3-4 组 x 6-12 次",
      advanced: "主动作 4-6 组 x 4-8 次 + 辅助 3-4 组 x 8-12 次"
    }[level];
    return {
      structure,
      intensity: "RPE 7-9，保留 1-3 次力竭余量",
      rest: "主动作 2-3 分钟，辅助动作 60-90 秒"
    };
  }

  if (sessionType === "strength_endurance") {
    const structure = {
      beginner: "每动作 2-3 组 x 12-15 次",
      intermediate: "每动作 3 组 x 10-15 次",
      advanced: "每动作 3-4 组 x 8-15 次"
    }[level];
    return {
      structure,
      intensity: "RPE 6-7",
      rest: "45-75 秒"
    };
  }

  const strengthStructure = {
    beginner: "每动作 2-3 组 x 8-12 次",
    intermediate: "每动作 3-4 组 x 6-12 次",
    advanced: "主动作 4-6 组 x 3-6 次 + 辅助 3-4 组 x 6-10 次"
  }[level];

  const strengthIntensity = goalPlanKey === "muscle-gain"
    ? "RPE 7-9，逐周微增负荷"
    : "RPE 6-8，动作标准优先";

  return {
    structure: strengthStructure,
    intensity: strengthIntensity,
    rest: "60-180 秒（主动作更长）"
  };
}

function getExecutionCue(sessionType) {
  if (sessionType.startsWith("cardio")) {
    return "先热身 5-8 分钟，主训练后降速 3-5 分钟，保持呼吸节奏稳定。";
  }
  if (sessionType === "recovery") {
    return "动作范围由小到大，配合呼吸，不追求疲劳感。";
  }
  if (sessionType === "metabolic") {
    return "每轮保持动作标准优先，宁可减速也不要变形。";
  }
  return "离心约 2 秒、向心约 1 秒，每组保留 1-3 次力竭余量。";
}

function getExercisePrescriptionLine(sessionType, level, exerciseIndex) {
  const strengthRules = {
    beginner: { main: "3-4 组 x 6-8 次", assist: "2-3 组 x 8-12 次", mainRest: "120-180 秒", assistRest: "60-90 秒" },
    intermediate: { main: "4-5 组 x 4-6 次", assist: "3-4 组 x 6-10 次", mainRest: "150-240 秒", assistRest: "75-120 秒" },
    advanced: { main: "5-6 组 x 2-5 次", assist: "3-5 组 x 4-8 次", mainRest: "180-300 秒", assistRest: "90-150 秒" }
  };
  const hypertrophyRules = {
    beginner: { main: "3 组 x 8-12 次", assist: "2-3 组 x 10-15 次", mainRest: "75-120 秒", assistRest: "45-75 秒" },
    intermediate: { main: "4 组 x 6-10 次", assist: "3-4 组 x 8-12 次", mainRest: "90-150 秒", assistRest: "60-90 秒" },
    advanced: { main: "4-6 组 x 5-8 次", assist: "3-5 组 x 8-12 次", mainRest: "120-180 秒", assistRest: "60-90 秒" }
  };
  const enduranceRules = {
    beginner: { volume: "2-3 组 x 12-15 次", rest: "45-60 秒" },
    intermediate: { volume: "3 组 x 12-15 次", rest: "45-75 秒" },
    advanced: { volume: "3-4 组 x 10-15 次", rest: "60-75 秒" }
  };
  const intervalRules = {
    beginner: "6-8 组 x 30 秒工作 / 60 秒恢复",
    intermediate: "7-10 组 x 40 秒工作 / 40 秒恢复",
    advanced: "8-12 组 x 45 秒工作 / 30 秒恢复"
  };
  const circuitRules = {
    beginner: { volume: "3 轮 x 每动作 30 秒", rest: "动作间 20 秒，每轮后 90 秒" },
    intermediate: { volume: "4 轮 x 每动作 40 秒", rest: "动作间 20 秒，每轮后 90 秒" },
    advanced: { volume: "4-5 轮 x 每动作 45 秒", rest: "动作间 15 秒，每轮后 90-120 秒" }
  };

  if (sessionType === "strength") {
    const rule = strengthRules[level];
    const isMain = exerciseIndex < 2;
    return `${isMain ? rule.main : rule.assist}｜组间 ${isMain ? rule.mainRest : rule.assistRest}`;
  }

  if (sessionType === "hypertrophy") {
    const rule = hypertrophyRules[level];
    const isMain = exerciseIndex < 2;
    return `${isMain ? rule.main : rule.assist}｜组间 ${isMain ? rule.mainRest : rule.assistRest}`;
  }

  if (sessionType === "strength_endurance") {
    const rule = enduranceRules[level];
    return `${rule.volume}｜组间 ${rule.rest}`;
  }

  if (sessionType === "metabolic") {
    const rule = circuitRules[level];
    return `${rule.volume}｜${rule.rest}`;
  }

  if (sessionType === "cardio_zone1") {
    if (exerciseIndex === 0) {
      return "25-40 分钟连续稳态（Zone1）｜全程连续";
    }
    return "2-3 组 x 8-12 次或 30-45 秒｜组间 30-45 秒";
  }

  if (sessionType === "cardio_zone2") {
    if (exerciseIndex === 0) {
      return "30-60 分钟连续稳态（Zone2）｜全程连续";
    }
    return "2 组 x 8-12 次动态活动｜组间 30-45 秒";
  }

  if (sessionType === "cardio_interval") {
    if (exerciseIndex === 0) {
      return `${intervalRules[level]}｜按恢复段休息`;
    }
    if (exerciseIndex === 1) {
      return "3-4 组 x 30-40 秒｜组间 40-60 秒";
    }
    return "8-12 分钟降速与整理活动｜持续低强度";
  }

  if (sessionType === "cardio_long") {
    if (exerciseIndex === 0) {
      return "60-90 分钟低强度连续耐力｜保持稳定配速";
    }
    return "每 20-30 分钟补水 1 次｜训练中执行";
  }

  if (sessionType === "recovery") {
    if (exerciseIndex === 0) {
      return "20-30 分钟轻松活动｜RPE 2-3";
    }
    return "2-3 组 x 30-45 秒｜组间 20-30 秒";
  }

  const fallback = hypertrophyRules[level];
  return `${fallback.assist}｜组间 ${fallback.assistRest}`;
}

function buildDayCard(dayIndex, session, values, goalPlanKey) {
  const { goal, level, equipment, focus, duration } = values;
  const exercises = equipment === "gym" ? session.gym : session.home;
  const prescription = getPrescription(goalPlanKey, goal, level, session.type);
  const executionCue = getExecutionCue(session.type);
  const focusText = focus.trim() ? `重点补充：${escapeHtml(focus.trim())} 2-3 组` : "";

  const items = exercises
    .map((item, index) => (
      `<li><strong>${escapeHtml(item)}</strong>：${getExercisePrescriptionLine(session.type, level, index)}</li>`
    ))
    .join("");

  return `
    <article class="day-card">
      <h3>${dayNames[dayIndex]} · ${session.name}</h3>
      <p>时长：约 ${duration} 分钟</p>
      <p>结构：${prescription.structure}</p>
      <p>强度：${prescription.intensity}</p>
      <p>休息：${prescription.rest}</p>
      <p>执行要点：${executionCue}</p>
      <ul>${items}</ul>
      ${focusText ? `<p>${focusText}</p>` : ""}
    </article>
  `;
}

function buildRestDayCard(dayIndex) {
  return `
    <article class="day-card rest-day">
      <h3>${dayNames[dayIndex]} · 恢复日</h3>
      <p>建议：20-30 分钟轻松步行 + 8-12 分钟拉伸</p>
      <p>强度：RPE 2-3，保持轻松可对话</p>
      <p>重点：补水、睡眠和软组织放松</p>
      <ul>
        <li>颈肩/髋关节活动度练习</li>
        <li>下肢轻度拉伸与呼吸放松</li>
      </ul>
    </article>
  `;
}

function getTrainingDayIndices(days) {
  return trainingDayPatterns[days] || [0, 2, 4, 6];
}

function formatSchedule(dayIndices) {
  return dayIndices.map((idx) => dayNames[idx]).join(" / ");
}

function syncCustomGoalField() {
  const isCustomGoal = goalSelect.value === "custom";
  customGoalWrapper.classList.toggle("is-hidden", !isCustomGoal);
  customGoalInput.required = isCustomGoal;
  if (!isCustomGoal) {
    customGoalInput.value = "";
  }
}

function getNutritionPlan(values, goalProfile) {
  const { level, days, duration, weight, dietStyle } = values;
  const weightValue = Number.isFinite(weight) ? weight : 65;
  const loadFactor = days * (duration / 60);
  const levelFactor = level === "advanced" ? 2 : level === "intermediate" ? 1 : 0;
  const maintenance = weightValue * (28 + Math.min(8, loadFactor + levelFactor));

  let calories = maintenance + goalProfile.calorieDelta;
  const protein = Math.round(weightValue * goalProfile.proteinPerKg);
  const fat = Math.round(weightValue * goalProfile.fatPerKg);
  calories = Math.round(Math.max(weightValue * 24, Math.min(weightValue * 45, calories)));
  const carbs = Math.round(Math.max(weightValue * 2, (calories - protein * 4 - fat * 9) / 4));

  return {
    calories,
    protein,
    fat,
    carbs,
    dietTemplate: mealTemplates[dietStyle],
    isEstimatedWeight: !Number.isFinite(weight)
  };
}

function buildNutritionSection(nutrition, values) {
  const { dietTemplate, calories, protein, fat, carbs, isEstimatedWeight } = nutrition;
  const weightText = isEstimatedWeight
    ? "未填写体重，按 65kg 估算。"
    : `按体重 ${values.weight}kg 估算。`;

  const meals = dietTemplate.meals
    .map((meal) => `
      <article class="meal-item">
        <h4>${meal.name}</h4>
        <p>${meal.detail}</p>
      </article>
    `)
    .join("");

  return `
    <section class="nutrition-panel">
      <h3>饮食建议联动</h3>
      <p class="nutrition-summary">
        饮食模式：${dietTemplate.label}｜建议日摄入：约 ${calories} kcal｜${weightText}
      </p>
      <div class="macro-grid">
        <article class="macro-card">
          <p>蛋白质</p>
          <strong>${protein}g</strong>
        </article>
        <article class="macro-card">
          <p>碳水</p>
          <strong>${carbs}g</strong>
        </article>
        <article class="macro-card">
          <p>脂肪</p>
          <strong>${fat}g</strong>
        </article>
      </div>
      <div class="meal-plan">${meals}</div>
      <p class="footnote">蛋白建议范围约 1.6-2.2 g/kg，训练日优先保证主餐蛋白和碳水。</p>
    </section>
  `;
}

function getMacrocycleTemplate(goalPlanKey, selectedGoal) {
  if (selectedGoal === "strength" || goalPlanKey === "muscle-gain") {
    return {
      label: "力量/增肌周期",
      focus: ["容量积累", "强度提升", "实现与巩固"],
      progression: [
        "第1周：主动作按当前计划执行，动作质量优先。",
        "第2周：主动作每个核心动作 +1 组，或负荷 +2.5%。",
        "第3周：保持组数，核心动作负荷 +2.5%-5%。",
        "第4周（减量周）：主动作总组数 -35%-45%，负荷 -10%-15%。"
      ]
    };
  }

  if (goalPlanKey === "endurance") {
    return {
      label: "耐力周期",
      focus: ["有氧基础", "阈值强化", "巩固与恢复"],
      progression: [
        "第1周：Zone2 总时长按基线执行。",
        "第2周：Zone2 总时长 +5%-10%。",
        "第3周：增加 1 次阈值/间歇刺激（总量不暴增）。",
        "第4周（减量周）：总量 -30%-40%，保留少量强度。"
      ]
    };
  }

  return {
    label: "减脂/体态周期",
    focus: ["动作巩固与容量", "代谢压力提升", "巩固与恢复"],
    progression: [
      "第1周：抗阻 + 有氧按基线执行，控制饮食节奏。",
      "第2周：总步数/有氧时长 +5%-10%。",
      "第3周：代谢循环或间歇多 1-2 组。",
      "第4周（减量周）：抗阻总组数 -30%-40%，优先恢复。"
    ]
  };
}

function buildMacrocycleSection(values, goalProfile) {
  const cycleWeeks = values.cycleWeeks;
  const template = getMacrocycleTemplate(goalProfile.planKey, values.goal);
  const blockCards = [];
  let startWeek = 1;
  let blockIndex = 0;

  while (startWeek <= cycleWeeks) {
    const endWeek = Math.min(cycleWeeks, startWeek + 3);
    const focus = template.focus[Math.min(blockIndex, template.focus.length - 1)];
    const stepItems = [];
    for (let week = startWeek; week <= endWeek; week += 1) {
      const inBlockWeek = week - startWeek;
      const stepText = template.progression[Math.min(inBlockWeek, template.progression.length - 1)];
      stepItems.push(`<li><strong>第 ${week} 周：</strong>${stepText.replace(/^第\d周：/, "")}</li>`);
    }

    blockCards.push(`
      <article class="day-card">
        <h3>第 ${startWeek}-${endWeek} 周 · ${focus}</h3>
        <p>阶段目标：${template.label}</p>
        <ul>${stepItems.join("")}</ul>
      </article>
    `);

    startWeek = endWeek + 1;
    blockIndex += 1;
  }

  return `
    <section class="nutrition-panel">
      <h3>大周期总计划（${cycleWeeks} 周）</h3>
      <p class="nutrition-summary">
        结构：每 4 周为一个小周期（3 周渐进 + 1 周减量/恢复），总计 ${Math.ceil(cycleWeeks / 4)} 个小周期。
      </p>
      <div class="week-grid">${blockCards.join("")}</div>
      <p class="footnote">进阶原则：每周只提升一个维度（组数、负荷或训练时长），避免同时大幅增加。</p>
    </section>
  `;
}

function buildEvidenceSection(values, config, sessionKeys, goalProfile) {
  const { goal, level } = values;
  const sessions = sessionKeys.map((key) => config.catalog[key]);
  const strengthDays = sessions.filter((item) => (
    item.type === "strength" || item.type === "hypertrophy" || item.type === "strength_endurance" || item.type === "metabolic"
  )).length;
  const cardioDays = sessions.filter((item) => (
    item.type.startsWith("cardio")
  )).length;

  return `
    <section class="nutrition-panel evidence-panel">
      <h3>计划设计依据（美国四大认证框架）</h3>
      <ul class="evidence-list">
        <li><strong>目标解释：</strong>${goalProfile.displayLabel}（生成框架：${config.title}）</li>
        <li><strong>水平判定：</strong>${getLevelStandard(level)}</li>
        <li><strong>ACSM：</strong>${config.acsmCardioTarget}。当前排布：抗阻 ${strengthDays} 天，有氧 ${cardioDays} 天。</li>
        <li><strong>NSCA：</strong>${config.nscaFocus}，并使用按水平分层的组次/休息参数。</li>
        ${goal === "strength" ? "<li><strong>增力参数：</strong>基础力量阶段可采用约 80-95% 1RM，2-6 组 x 2-6 次（主动作长休息）。</li>" : ""}
        <li><strong>NASM：</strong>${getNasmPhase(level, goalProfile.planKey)}。</li>
        <li><strong>ACE：</strong>${getAceZoneGuideline(level)}，并建议每周训练总量增幅不超过 10%。</li>
      </ul>
      <p class="footnote">说明：该生成器用于健康成年人通用训练参考，不替代个体化医疗与康复处方。</p>
    </section>
  `;
}

function generatePlan(values) {
  const goalProfile = resolveGoalProfile(values);
  const config = plans[goalProfile.planKey];
  const sessionKeys = config.split[values.days];
  const trainingDayIndices = getTrainingDayIndices(values.days);
  const nutrition = getNutritionPlan(values, goalProfile);
  const weekCards = [];
  let sessionPointer = 0;
  for (let dayIndex = 0; dayIndex < dayNames.length; dayIndex += 1) {
    if (trainingDayIndices.includes(dayIndex)) {
      const sessionKey = sessionKeys[sessionPointer];
      weekCards.push(buildDayCard(dayIndex, config.catalog[sessionKey], values, goalProfile.planKey));
      sessionPointer += 1;
    } else {
      weekCards.push(buildRestDayCard(dayIndex));
    }
  }

  const restDays = 7 - values.days;
  result.innerHTML = `
    <h2>你的一周训练 + 饮食计划</h2>
    <p class="plan-summary">
      目标：${goalProfile.displayLabel}｜水平：${levelLabel(values.level)}｜训练频率：每周 ${values.days} 天｜恢复日：${restDays} 天｜总周期：${values.cycleWeeks} 周｜推荐排期：${formatSchedule(trainingDayIndices)}
    </p>
    ${buildMacrocycleSection(values, goalProfile)}
    <div class="week-grid">${weekCards.join("")}</div>
    ${buildEvidenceSection(values, config, sessionKeys, goalProfile)}
    ${buildNutritionSection(nutrition, values)}
    <p class="footnote">每次训练前热身 8-10 分钟，训练后拉伸 5-8 分钟。若出现明显疼痛，请暂停并调整动作。</p>
  `;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (planGenerating) {
    return;
  }

  const days = Number(document.getElementById("days").value);
  const cycleWeeks = Number(document.getElementById("cycle-weeks").value);
  const duration = Number(document.getElementById("duration").value);
  const weight = Number(document.getElementById("weight").value);

  const payload = {
    goal: goalSelect.value,
    level: document.getElementById("level").value,
    days: Number.isNaN(days) ? 4 : Math.min(6, Math.max(2, days)),
    cycleWeeks: Number.isNaN(cycleWeeks) ? 12 : Math.min(24, Math.max(4, cycleWeeks)),
    duration: Number.isNaN(duration) ? 60 : Math.min(120, Math.max(20, duration)),
    equipment: document.getElementById("equipment").value,
    weight: Number.isNaN(weight) ? Number.NaN : Math.min(180, Math.max(35, weight)),
    dietStyle: document.getElementById("diet-style").value,
    customGoal: customGoalInput.value,
    focus: document.getElementById("focus").value
  };

  if (payload.goal === "custom" && !String(payload.customGoal || "").trim()) {
    result.innerHTML = `
      <h2>你的一周训练 + 饮食计划</h2>
      <p class="hint">选择“其他（自定义）”时，请填写你的具体目标。</p>
    `;
    return;
  }

  planGenerating = true;
  if (planSubmitBtn) {
    planSubmitBtn.disabled = true;
    planSubmitBtn.textContent = "生成中...";
  }

  try {
    generatePlan(payload);
  } catch {
    result.innerHTML = `
      <h2>你的一周训练 + 饮食计划</h2>
      <p class="hint">生成失败，请检查输入后重试。</p>
    `;
  } finally {
    planGenerating = false;
    if (planSubmitBtn) {
      planSubmitBtn.disabled = false;
      planSubmitBtn.textContent = "生成训练 + 饮食计划";
    }
  }
});

goalSelect.addEventListener("change", syncCustomGoalField);
syncCustomGoalField();
modeLoginBtn.addEventListener("click", () => setAuthMode("login"));
modeRegisterBtn.addEventListener("click", () => setAuthMode("register"));
setAuthMode("login");
loginForm.addEventListener("submit", handleLoginSubmit);
logoutBtn.addEventListener("click", handleLogout);
initAuth();
