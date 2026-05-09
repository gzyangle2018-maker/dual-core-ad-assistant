# 双核广告助手 v2.0 SaaS

**LeoYoung Original**

基于《双核投放法》核心理论的亚马逊广告批量诊断 SaaS 平台。

## 功能模块

- 批量报告诊断（拖拽上传 CSV/Excel/TXT）
- 双核概览知识库
- 智能出价计算器
- 竞价策略指南
- 匹配类型助手
- 目标策略配置
- 核心指标分析
- COSMO 算法优化
- 数据可视化（Chart.js）
- 用户管理与权限控制

## 技术架构

- **前端**: Cloudflare Pages（纯 HTML/CSS/JS）
- **后端**: Cloudflare Worker（JavaScript）
- **存储**: Cloudflare KV + D1
- **CI/CD**: GitHub Actions

## 默认账号

- 管理员: `admin` / `admin123`
- 运营: `operator` / `op123`

## 部署

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署 Worker
cd worker && wrangler deploy

# 部署 Pages
wrangler pages deploy frontend --project-name=dual-core-ad-assistant
```

## 自动部署

Push 到 `main` 分支 → GitHub Actions 自动触发 → Cloudflare 部署
