// ============================================================
// 双核广告助手 v2.0 SaaS - Cloudflare Worker 后端
// LeoYoung Original
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

// 内存存储（Worker 同实例内共享）
const MEM_STORE = new Map();
function memGet(key) { return MEM_STORE.get(key); }
function memSet(key, val) { MEM_STORE.set(key, val); }

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function generateId() {
  return crypto.randomUUID();
}

function hashPassword(pwd) {
  let h = 0;
  for (let i = 0; i < pwd.length; i++) {
    h = ((h << 5) - h + pwd.charCodeAt(i)) | 0;
  }
  return String(h);
}

// ==================== 认证中间件 ====================

async function authenticate(request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const userData = memGet(`token:${token}`);
  if (!userData) return null;
  try { return JSON.parse(userData); } catch (e) { return null; }
}

function requireAuth(user, minRole = "operator") {
  if (!user) throw new Error("Unauthorized");
  const roles = { operator: 1, admin: 2 };
  if (roles[user.role] < roles[minRole]) throw new Error("Forbidden");
}

// ==================== 诊断引擎 ====================

function runDiagnosis(reports, config) {
  const targetACOS = parseFloat(config.target_acos) || 25;
  const stage = config.product_stage || "成熟期";
  const goal = config.main_goal || "获取曝光";

  const campaigns = reports.campaign_report || [];
  const searchTerms = reports.search_term_report || [];

  let totalSpend = 0, totalSales = 0, totalClicks = 0, totalImpressions = 0, totalOrders = 0;
  for (const c of campaigns) {
    totalSpend += parseFloat(c.spend) || 0;
    totalSales += parseFloat(c.sales) || 0;
    totalClicks += parseFloat(c.clicks) || 0;
    totalImpressions += parseFloat(c.impressions) || 0;
    totalOrders += parseFloat(c.orders) || 0;
  }

  const acos = totalSales > 0 ? (totalSpend / totalSales * 100) : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
  const cvr = totalClicks > 0 ? (totalOrders / totalClicks * 100) : 0;
  const cpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

  const issues = [];
  if (acos > targetACOS * 1.5) issues.push({ severity: "critical", text: `ACOS ${acos.toFixed(1)}% 远超目标 ${targetACOS}%` });
  else if (acos > targetACOS) issues.push({ severity: "warning", text: `ACOS ${acos.toFixed(1)}% 高于目标 ${targetACOS}%` });
  if (cvr < 5) issues.push({ severity: "warning", text: `转化率 ${cvr.toFixed(1)}% 偏低` });
  if (ctr < 0.2) issues.push({ severity: "warning", text: `CTR ${ctr.toFixed(2)}% 偏低` });
  if (totalSpend < 10) issues.push({ severity: "info", text: "花费极低，建议增加预算获取数据" });

  const highSpendNoSales = [];
  const aceKeywords = [];
  const keywordIssues = [];

  for (const st of searchTerms) {
    const clicks = parseFloat(st.clicks) || 0;
    const orders = parseFloat(st.orders) || 0;
    const acosVal = parseFloat(st.acos) || 0;
    if (clicks >= 10 && orders === 0) highSpendNoSales.push(st.search_term || "Unknown");
    if (acosVal > targetACOS * 1.5 && clicks > 5) keywordIssues.push({ term: st.search_term || "Unknown", acos: acosVal });
    if ((st.ctr || 0) > 0.5 && (st.cvr || 0) > 10 && orders >= 3) aceKeywords.push(st.search_term || "Unknown");
  }

  const searchTermActions = [];
  for (const st of searchTerms.slice(0, 30)) {
    const clicks = parseFloat(st.clicks) || 0;
    const orders = parseFloat(st.orders) || 0;
    const acosVal = parseFloat(st.acos) || 0;
    if (clicks >= 10 && orders === 0) searchTermActions.push({ term: st.search_term || "", action: "精准否定", reason: "点击10次无转化" });
    else if (acosVal > 40 && clicks > 5) searchTermActions.push({ term: st.search_term || "", action: "降低竞价或否定", reason: `ACOS ${acosVal.toFixed(1)}%过高` });
    else if ((st.ctr || 0) > 0.5 && (st.cvr || 0) > 10) searchTermActions.push({ term: st.search_term || "", action: "拆精准组 + 提高竞价", reason: "王牌词" });
  }

  const recommendations = [];
  if (issues.some(i => i.severity === "critical")) {
    recommendations.push("立即暂停 ACOS 超过 50% 的广告活动，集中预算到表现优秀的活动");
    recommendations.push("检查高点击无转化的搜索词，添加精准否定");
  }
  if (cvr < 5) recommendations.push("转化率偏低，优先优化 Listing（主图、标题、A+内容）");
  if (aceKeywords.length > 0) recommendations.push(`将王牌词 [${aceKeywords.slice(0, 3).join(", ")}] 拆分为独立精准组`);

  const actionPlan = [
    `今日：否定高点击无转化词（${highSpendNoSales.slice(0, 5).join(", ") || "无"}）`,
    "今日：ACOS < 20% 的活动预算增加 30%",
    "3天内：优化 Listing 提升转化率",
    "7天内：基于 ABA 数据新增 5-10 个高流量精准词"
  ];

  return {
    summary: { total_spend: totalSpend.toFixed(2), total_sales: totalSales.toFixed(2), acos: acos.toFixed(2), ctr: ctr.toFixed(2), cvr: cvr.toFixed(2), cpc: cpc.toFixed(2), campaigns_count: campaigns.length, search_terms_count: searchTerms.length, target_acos: targetACOS, product_stage: stage, main_goal: goal },
    issues,
    keyword_analysis: { high_spend_no_sales: highSpendNoSales.slice(0, 10), ace_keywords: aceKeywords.slice(0, 10), keyword_issues: keywordIssues.slice(0, 10) },
    search_term_actions: searchTermActions.slice(0, 20),
    recommendations,
    action_plan: actionPlan,
    generated_at: new Date().toISOString()
  };
}

// ==================== 知识库 ====================

const KNOWLEDGE_BASE = {
  dual_core: "双核投放法核心理念：同时把控流量广度与投放精度，实现关键词全覆盖与CPA精准控制。",
  formulas: {
    cpc: "CPC = CPS × CVR",
    ecpm_natural: "Natural eCPM = 1000 × eCTR × eCVR × Price",
    ecpm_ad: "Ad eCPM = eCTR × Bid",
    net_profit: "Net Profit = (Gross Margin - TACOS) × Price × Units"
  },
  cosmo: "COSMO算法三层知识转化：用户画像 → 购物意图 → 知识匹配。",
  attribution: { sp: "7 days, last-touch", sb: "14 days, last-touch", sd: "14 days, view-through + click", tv: "14 days" }
};

// ==================== 路由处理 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (path === "/api/health" && method === "GET") {
        return jsonResponse({ status: "healthy", version: "2.0.0", brand: "LeoYoung Original" });
      }

      // 登录
      if (path === "/api/auth/login" && method === "POST") {
        const { username, password } = await request.json();
        const adminHash = memGet("auth:admin:hash");
        const opHash = memGet("auth:operator:hash");
        let role = null;
        const inputHash = hashPassword(password);

        if (adminHash && adminHash === inputHash) role = "admin";
        else if (opHash && opHash === inputHash) role = "operator";
        else {
          if (username === "admin" && password === "admin123") {
            role = "admin";
            memSet("auth:admin:hash", hashPassword("admin123"));
          } else if (username === "operator" && password === "op123") {
            role = "operator";
            memSet("auth:operator:hash", hashPassword("op123"));
          }
        }

        if (!role) return jsonResponse({ error: "Invalid credentials" }, 401);
        const token = generateId();
        memSet(`token:${token}`, JSON.stringify({ username, role, created_at: new Date().toISOString() }));
        return jsonResponse({ token, role, username });
      }

      const user = await authenticate(request);

      if (path === "/api/auth/me" && method === "GET") {
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
        return jsonResponse(user);
      }

      if (path === "/api/admin/users" && method === "GET") {
        requireAuth(user, "admin");
        const users = [];
        if (memGet("auth:admin:hash")) users.push({ username: "admin", role: "admin" });
        if (memGet("auth:operator:hash")) users.push({ username: "operator", role: "operator" });
        return jsonResponse({ users });
      }

      if (path === "/api/admin/password" && method === "POST") {
        requireAuth(user, "admin");
        const { username, newPassword } = await request.json();
        memSet(`auth:${username}:hash`, hashPassword(newPassword));
        return jsonResponse({ message: "Password updated" });
      }

      if (path === "/api/admin/config" && method === "GET") {
        requireAuth(user, "admin");
        const config = memGet("app:config");
        return jsonResponse(config ? JSON.parse(config) : {});
      }

      if (path === "/api/admin/config" && method === "POST") {
        requireAuth(user, "admin");
        const config = await request.json();
        memSet("app:config", JSON.stringify(config));
        return jsonResponse({ message: "Config saved" });
      }

      if (path === "/api/diagnosis/batch" && method === "POST") {
        requireAuth(user, "operator");
        const { reports, config } = await request.json();
        const result = runDiagnosis(reports || {}, config || {});
        const diagnosisId = generateId();
        memSet(`diagnosis:${diagnosisId}`, JSON.stringify({ result, user: user.username, created_at: new Date().toISOString() }));
        return jsonResponse({ diagnosis_id: diagnosisId, result });
      }

      if (path === "/api/diagnosis/history" && method === "GET") {
        requireAuth(user, "operator");
        const items = [];
        for (const [key, val] of MEM_STORE) {
          if (key.startsWith("diagnosis:")) {
            const parsed = JSON.parse(val);
            items.push({ id: key.replace("diagnosis:", ""), user: parsed.user, created_at: parsed.created_at });
          }
        }
        return jsonResponse({ items: items.slice(0, 50) });
      }

      if (path.startsWith("/api/diagnosis/") && method === "GET") {
        requireAuth(user, "operator");
        const id = path.split("/")[3];
        const val = memGet(`diagnosis:${id}`);
        if (!val) return jsonResponse({ error: "Not found" }, 404);
        return jsonResponse(JSON.parse(val));
      }

      if (path === "/api/knowledge" && method === "GET") {
        requireAuth(user, "operator");
        return jsonResponse(KNOWLEDGE_BASE);
      }

      return jsonResponse({ error: "Not Found" }, 404);

    } catch (error) {
      console.error("Worker Error:", error);
      if (error.message === "Unauthorized") return jsonResponse({ error: "Unauthorized" }, 401);
      if (error.message === "Forbidden") return jsonResponse({ error: "Forbidden" }, 403);
      return jsonResponse({ error: error.message || "Internal Server Error" }, 500);
    }
  }
};
