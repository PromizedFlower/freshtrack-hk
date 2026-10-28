# FreshTrack HK — 智能生鲜冰箱管理与惜食减废平台

[![SDG 12.3](https://img.shields.io/badge/UN_SDG-12.3_Food_Waste-16A34A)](https://sdgs.un.org/goals/goal12)
[![Frontend](https://img.shields.io/badge/Frontend-Uni--app_Vue3_%2B_PWA-0B3B2E)](https://uniapp.dcloud.net.cn/)
[![Backend](https://img.shields.io/badge/Backend-Supabase_PostgreSQL-3ECF8E)](https://supabase.com/)
[![AI Engine](https://img.shields.io/badge/AI_Vision-Gemini_2.5_Flash-0EA5E9)](https://ai.google.dev/gemini-api/docs/image-understanding)

> **Important Compliance Notice (食品安全合规边界)**：  
> FreshTrack HK 仅基于权威食物储存规则（USDA FoodKeeper 及香港食物安全中心指引）与包装日期估算食材的**「腐坏风险（Spoilage Risk）」**，不通过 AI 图像判定食物是否安全可食。系统中严格区分 **`best-before`（此日期前最佳，关乎品质）** 与 **`use-by`（此日期或之前食用，关乎安全）**。

---

## 一、 项目背景与产品架构

**FreshTrack HK** 是一款面向香港及都市家庭的智能生鲜冰箱管理应用（支持**微信小程序**与**响应式 Web / PWA** 双端同构运行）。产品采用自下而上的四层解耦架构：

1. **第一层：数据输入层（Data Input）** — 支持香港中英混排超市收据扫描（百佳/惠康/HKTVmall）、食材与保质期喷码拍照识别、Open Food Facts 条形码扫描及手动快捷录入。
2. **第二层：规则与估算层（Rules & Estimation）** — 基于内置的 150+ 种高频生鲜储存规则字典与 `best-before` / `use-by` 区分逻辑，动态输出 **High / Medium / Low** 三档腐坏风险评分。
3. **第三层：决策与推荐层（Decision & Recommendation）** — 提供临期预警排序（Use Soon）、优先消耗临期高风险食材的抢救菜谱匹配（Rescue Recipes）以及联合国 SDG 12.3 减废与碳排（$\text{CO}_2\text{e}$）量化核算。
4. **第四层：界面展示层（Presentation）** — 包含五屏核心视图（`Dashboard / Home`、`My Fridge`、`Recipes`、`Add Item`、`Impact`），采用「深林绿 `#0B3B2E` + 品牌绿 `#16A34A` + 三档高对比度风险语义色」视觉体系，并通过 CSS Variables 实现逻辑与样式彻底解耦，支持后期视觉一键换肤。

---

## 二、 仓库目录结构

```text
freshtrack-hk/
├── README.md                          # 项目总览与快速启动指南
├── docs/
│   └── PRD_MVP_and_Roadmap.md         # 产品策划、MVP 功能说明书与 V2/V3 演进路线图
├── prototypes/                        # 交互视觉基准（v1.1 高保真单文件可点击原型）
│   ├── FreshTrack_HK_web_dashboard.html
│   └── FreshTrack_HK_mobile_app.html
├── backend/
│   ├── supabase/
│   │   ├── schema.sql                 # PostgreSQL 5 张核心业务表、索引与视图定义
│   │   └── seed_storage_rules.sql     # 香港常见生鲜储存规则与碳排系数种子数据
│   └── functions/
│       └── ai-scan/index.ts           # 基于 Gemini 2.5 Flash 的小票/食材识别云函数
└── frontend/
    ├── src/
    │   ├── styles/tokens.css          # 13 色语义色板 CSS 变量（支持后期 UI 大改版）
    │   └── utils/riskCalculator.ts    # 腐坏风险三档评估与 SDG 减废核算核心纯函数
```

---

## 三、 快速启动指南（零后端基础 10 分钟跑通）

### 1. 预览高保真交互原型
直接用浏览器打开 `prototypes/FreshTrack_HK_web_dashboard.html`（桌面大屏端）或 `prototypes/FreshTrack_HK_mobile_app.html`（手机端五屏并排/单机切换视图）。

### 2. 初始化 Supabase 云数据库
1. 登录 [Supabase](https://supabase.com/) 创建免费项目。
2. 进入左侧 **SQL Editor**，依次粘贴并执行：
   - `backend/supabase/schema.sql`（创建核心表结构）
   - `backend/supabase/seed_storage_rules.sql`（导入生鲜规则字典与初始菜谱）

### 3. 部署 AI 视觉扫描云函数
```bash
supabase secrets set GEMINI_API_KEY=your_google_gemini_api_key
# 可选：切换 AI 模型（默认 flash；Google AI Pro 会员可改为 gemini-2.5-pro 提升识别准确率）
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase functions deploy ai-scan
```
> 模型 ID 由环境变量 `GEMINI_MODEL` 控制，默认 `gemini-2.5-flash`（快、省、日额度高）。如需更高识别准确率，可设为 `gemini-2.5-pro`（更慢、更贵、日额度更低）。

---

## 四、 100% 零成本（全免费）技术渠道与额度核查清单

本项目推荐的主力开发、部署与 AI 渠道均支持 **免绑信用卡、0 元启动**，完全满足课程项目、个人开发与 MVP 阶段试运营需求：

| 模块层级 | 推荐主力渠道 | 是否完全免费 | 免费额度明细 | 防扣费安全机制 |
| :--- | :--- | :--- | :--- | :--- |
| **前端框架与托管** | **Uni-app (Vue 3) + Vercel / GitHub Pages / 微信小程序** | **100% 免费** | • Uni-app 开源免费<br>• 微信小程序个人主体注册免费<br>• Vercel Hobby 个人版每月 100GB 免费流量 | 均无需绑定信用卡；超额仅限流，绝无自动扣费。 |
| **后端数据库与云函数** | **Supabase Free Plan (PostgreSQL BaaS)** | **100% 免费** | • 500 MB PostgreSQL 空间（可存数十万条食材记录）<br>• 1 GB 图片存储 + 50,000 月活用户鉴权<br>• 每月 500,000 次 Edge Functions 云函数调用 | 注册无需信用卡；免费项目若连续 7 天无访问会自动休眠，可在后台一键唤醒。 |
| **小票/食材/日期视觉识别与菜谱 Agent** | **Google Gemini 2.5 Flash (Google AI Studio Free Tier)** | **100% 免费** | • 每天免费 1,500 次请求（RPD）<br>• 每分钟 15 次请求（RPM）<br>• 每分钟 1,000,000 Tokens（TPM） | 在 Google AI Studio 直接生成 API Key（勿开通 Cloud Billing 付费账单），超额仅返回 HTTP 429，0 扣费风险。 |
| **香港/海外网络环境免代理 AI 备选** | **智谱 GLM-4V-Flash / GitHub Models** | **100% 免费** | • **GLM-4V-Flash**：智谱开放平台官方永久免费多模态视觉模型<br>• **GitHub Models**：凭 GitHub 账号 (`PromizedFlower`) 免费调用多模态模型 | 针对香港本地网络直连 Google AI Studio 可能受地区限制的情况，可零成本无缝切换至 GLM-4V-Flash。 |
| **商品条形码查询** | **Open Food Facts API** | **100% 开源免费** | • 全球非营利开源食品库，无调用次数收费，免注册 API Key | 纯公益开源接口，结合本地 `barcode_cache` 表缓存实现毫秒级响应。 |
| **生鲜保质期规则库** | **USDA FSIS FoodKeeper 数据集 + 本地规则表** | **100% 免费** | • 美国农业部官方公共领域（Public Domain）开放数据集 | 已整理为离线 SQL 脚本（`seed_storage_rules.sql`）直接写入本地数据库，0 外部调用费。 |

---

## 五、 一键推送到私有仓库 `PromizedFlower/freshtrack-hk`

1. 在浏览器打开 [https://github.com/new](https://github.com/new)，填入仓库名 **`freshtrack-hk`**，选择 **Private（私有）**，不要勾选 Initialize with README，点击 **Create repository**。
2. 解压本工程包，在终端进入文件夹执行以下命令即可完成首次推送：

```bash
git init
git branch -M main
git add .
git commit -m "feat: initial commit with FreshTrack HK MVP architecture, PRD, prototypes and Supabase schema"
git remote add origin https://github.com/PromizedFlower/freshtrack-hk.git
git push -u origin main
```
