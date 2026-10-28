# FreshTrack HK 产品策划、MVP 开发框架与未来功能演进说明书

**版本**：v2.0（全栈落地与工程化重构版）  
**角色**：产品经理 & 技术架构规划  
**基准视觉与原型**：基于 `FreshTrack_HK_mockups_v1.1`（五屏导航 + 九大模块 + 三档语义色体系）

---

## 一、 产品形态选型：小程序、Web/PWA 与原生 App 深度对比与决策建议

### 1.1 结论先行：采用「Uni-app (Vue 3) 跨端同构 —— 优先交付微信小程序 + 响应式 Web/PWA」是最简单、最高效的方案

针对你提出的“先做一版最简单的方案，小程序、App 还是 Web？”这一核心问题，从**开发成本、相机/扫码硬件调用、消息推送触达、零后端起步难度**以及**你现有的 HTML 原型资产复用率**五个维度评估，结论如下：

1. **最简交互验证与多端兼顾（推荐首选）**：使用 **[Uni-app](https://uniapp.dcloud.net.cn/)**（基于 Vue 3 + Vite）开发一套代码，**第一优先级编译为「微信小程序」与「移动端/桌面端响应式 H5 (PWA)」**。
   - **为什么微信小程序比独立原生 App 简单 80%？** 生鲜管理属于高频、碎片的家庭生活场景（站在冰箱前或超市收银台）。微信小程序天然具备**免安装即扫即用、一键调用原生相机与条形码识别（`wx.scanCode`）、微信订阅消息（临期提醒无需自建 APNs/FCM 推送通道）、微信天然家庭群分享协同**四大优势，且免去了 iOS App Store（$99/年开发者账号及严苛审核）与 Android 各大应用商店打包上架的繁琐流程。
   - **为什么要同时输出响应式 Web / PWA？** 你提供的 `FreshTrack_HK_web_dashboard.html` 与 `FreshTrack_HK_mobile_app.html` 已经是完成度极高的 HTML/CSS/JS 原型。如果涉及香港本地使用场景、高校课程演示（如 COMP7950 桌面大屏加手机双端展示）或海外无微信环境，Web/PWA 版本可通过 **[Vercel](https://vercel.com/)** 零配置一键部署，手机浏览器“添加到主屏幕”即可获得媲美原生 App 的全屏体验，且完全避开微信个人主体小程序对部分商业/AI 类目的审核限制。

### 1.2 四种前端终端形态量化对比矩阵

| 评估维度 | 方案 A：微信小程序 (基于 Uni-app) | 方案 B：响应式 Web / PWA | 方案 C：纯原生微信小程序 | 方案 D：独立原生 App (iOS / Android) |
| :--- | :--- | :--- | :--- | :--- |
| **综合实现难度** | ★★☆☆☆（极简，一套代码双端运行） | ★☆☆☆☆（最简单，可直接复用现有 HTML/CSS） | ★★☆☆☆（简单，但后续转 Web 需重写） | ★★★★★（极高，需双端编译、签名与上架） |
| **现有原型复用率** | **85%**（CSS 变量与 Flex/Grid 布局直接迁移） | **95%**（直接组件化拆解现有原型文件） | **60%**（需改写为 WXML 与 WXSS 语法） | **20%**（需使用 Swift/Kotlin 或 Flutter 重写） |
| **扫码与相机调用** | 原生级丝滑（`uni.scanCode` / `uni.chooseMedia`） | 良好（依赖浏览器 `MediaDevices` API） | 原生级丝滑（`wx.scanCode`） | 原生级最高性能，支持 AR 实时框选 |
| **临期提醒推送能力** | 强（微信服务通知 / 订阅消息直达微信聊天列表） | 中（依赖 Web Push / 邮件或日历 `.ics` 订阅） | 强（微信订阅消息） | 极强（系统级锁屏推送，但集成成本高） |
| **分发与审核门槛** | 低（二维码即扫即用，个人小程序注意 AI 类目合规） | **零门槛**（URL 链接即点即用，无需任何审核） | 低（仅限微信生态内打开） | 极高（App Store 审核严苛，测试分发繁琐） |
| **适用阶段建议** | **MVP 阶段核心主力（手机端场景）** | **MVP 阶段同步输出（大屏演示 + 跨平台兜底）** | 不建议单独写（不利于后期 Web 适配） | **V3.0 商业化成熟期再考虑封装** |

---

## 二、 零基础后端架构选型：Serverless / BaaS 极简全栈方案

针对目前**“后端没有任何框架”**的现状，切忌从零搭建传统的 Spring Boot 或 Django + 自建 MySQL + Nginx 运维体系。作为产品经理与架构师，我强烈建议采用 **BaaS（Backend-as-a-Service，后端即服务）+ Serverless 云函数** 架构，将后端开发工作量压缩 **70% 以上**。

### 2.1 两套开箱即用的零门槛后端架构对比

| 架构维度 | 推荐方案一：Supabase (PostgreSQL BaaS) + Edge Functions | 推荐方案二：微信云开发 (Tencent CloudBase) |
| :--- | :--- | :--- |
| **定位与核心优势** | 全球最流行的开源 Firebase 替代方案（[Supabase 官网](https://supabase.com/)），**一套后端同时服务 Web、小程序与未来 App** | 微信生态原生集成（[腾讯云开发文档](https://docs.cloudbase.net/en/ai/introduce)），免域名备案、免鉴权开发 |
| **数据库引擎** | 托管式 **PostgreSQL**（支持关系型外键、JSONB、向量检索 `pgvector`） | 托管式文档型 **NoSQL JSON 数据库** |
| **API 自动生成** | 建表即自动生成 RESTful API 与 GraphQL 接口（[Supabase Data REST API](https://supabase.com/docs/guides/api)），前端直接调 SDK，**无需写 CRUD 后端代码** | 前端直接通过 `wx.cloud.database()` 读写数据，无需编写传统接口 |
| **文件与图片存储** | **Supabase Storage**（存放小票照片、冰箱实拍图，带 CDN 加速） | 云存储 `wx.cloud.uploadFile` |
| **AI Agent 接入层** | **Supabase Edge Functions**（TypeScript/Deno）或轻量 **FastAPI** 云函数，安全隐藏大模型 API Key | **云函数 (Node.js / Python)**，在云端调用大模型与 OCR 接口 |
| **定时临期巡检** | 内置 `pg_cron` 定时任务，每日早 8:00 自动重算库存腐坏风险并触发通知 | 云函数定时触发器（`config.json` 配置 Cron 表达式） |
| **选型最终建议** | **首选方案**：因为你后续考虑 Web 适配且已有 Web Dashboard 原型，Supabase 能完美实现 Web 大屏与手机端实时同步（Realtime），且完全贴合 GitHub + Vercel 现代工程流。 | **备选方案**：如果团队决定 100% 只做微信小程序且放弃 Web 大屏同步，可选用微信云开发。 |

---

## 三、 核心功能拆解与技术实现渠道（Agent、API 与算法选型）

延续你在 `FreshTrack_HK_mockups_v1.1` 中确立的**自下而上四层架构（数据输入层 → 规则与估算层 → 决策与推荐层 → 界面展示层）**，以下明确每一层在真实开发中的 API 渠道、AI Agent 编排方式与合规边界。

### 3.1 第一层：数据输入层（多模态食材与日期采集）

用户在把生鲜放进冰箱时，最大的痛点是**“手动打字录入太繁琐，坚持不过三天”**。因此输入层必须通过多模态大模型（VLM）与条码库实现“3 秒极速入库”。

| 录入方式 | 业务场景与识别目标 | 推荐接入的 AI 模型 / API 服务渠道 | 技术实现与 Prompt 工程要点 |
| :--- | :--- | :--- | :--- |
| **① 超市收据扫描 (Scan Receipt)** | 扫描香港百佳 (PARKnSHOP)、惠康 (Wellcome)、HKTVmall、AEON 等中英混排超市小票，批量提取：**食材名称、分类、数量/克重、购买日期、单价 (HK$)** | **首选（推荐）：VLM 多模态大模型直接提取**<br>• **[Google Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/image-understanding)**（性价比最高、原生支持 Structured Outputs JSON 格式、精通中英粤繁体小票简写）<br>• 备选：OpenAI `gpt-4o-mini` / 阿里云通义千问 `Qwen-VL-Plus`<br>**次选：传统 OCR + LLM 清洗**<br>• 腾讯云/百度智能云通用票据 OCR + DeepSeek-V3 文本结构化 | 传统 OCR 遇到香港超市小票的英文缩写（如 `ORG BBY SPINACH 200G`）很难直接归类。直接使用 **Gemini 2.5 Flash Vision** 传入图片并绑定 JSON Schema，一次调用即可同时完成：**OCR 识别 + 中英文标准食材名归一化 + 自动匹配五大分类（Produce/Dairy/Meat/Bakery/Pantry）+ 估算默认保质期**。 |
| **② 拍照识别食材与保质期 (Photo Recognition)** | 1. 拍摄单个食材或冰箱层架，识别多件食材名称与大概余量<br>2. 拍摄食品包装上的日期喷码，自动区分并提取 **`best-before`（此日期前最佳）** 与 **`use-by`（此日期前食用）** | • **视觉识别与日期标签提取**：**[Google Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models)** 或 **[Google Cloud Vision API](https://docs.cloud.google.com/vision/docs)**<br>• **端侧预处理**：前端 Canvas 自动压缩图片至 `1024px` 长边（控制在 300KB 内），大幅降低 Token 消耗并将响应时间缩短至 1.5~2.5 秒。 | 在 System Prompt 中强制设定安全边界：若包装印有 `Use By / 此日期或之前食用`，输出 `date_type: "use_by"`；若印有 `Best Before / 此日期前最佳`，输出 `date_type: "best_before"`；若为无包装散装生鲜（如菜心、鲜肉），标记 `is_estimated: true` 并交由第二层规则库推算。 |
| **③ 条形码极速扫描 (Barcode Scan)** | 针对盒装牛奶、酸奶、酱料、包装面包，直接扫商品 EAN-13 / UPC 条形码获取标准商品名、品牌、净含量与缩略图 | • **全球开源食品库（免费）**：**[Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/)**（`GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`）<br>• **国内/本地补充库**：极速数据条码查询 API 或自建高频香港商品缓存表（Supabase `barcode_cache` 表） | 优先查询本地 `barcode_cache` 表（毫秒级响应）；未命中则请求 Open Food Facts API，命中后自动写入本地缓存，用户只需滑动滚轮确认到期日即可完成入库。 |
| **④ 语音/手动快捷录入 (Manual & Voice)** | 一句话语音录入（如“刚买了两盒明治鲜奶后天到期，还有半斤鸡胸肉”）或带自动补全词典的手动表单 | • **语音转文字**：微信小程序同声传译插件 / Web Speech API<br>• **NLU 语义槽位提取**：轻量 LLM（Gemini 2.5 Flash-Lite / DeepSeek-V3）提取 `[食材, 数量, 单位, 到期日, 储存位置]` | 手动录入页提供“常见生鲜保质期快捷 Chip”（点击“菠菜”自动带出“冷藏 · 建议 3 天内食用 · Best-before”），将手动点击次数压缩至 3 次以内。 |

### 3.2 第二层：规则与估算层（保质期字典与腐坏风险三档评估引擎）

这一层是产品的核心合规壁垒，严格遵循原型确立的红线：**“只基于储存规则与日期估算腐坏风险（Spoilage Risk），绝不由 AI 判定食物是否安全可食（Food Safety）”**。

1. **权威生鲜储存规则库（Storage Rules Knowledge Base）**：
   - **数据源构建**：以美国农业部食品安全检验局公开的 **[USDA FSIS FoodKeeper 数据集](https://catalog.data.gov/dataset/fsis-foodkeeper-data)** 为基础基准，结合香港食环署食物安全中心（CFS）关于易腐生鲜及冷链储存的指引，整理出 150~200 种高频家庭食材的标准静态规则 JSON/数据表（涵盖常温 Pantry、冷藏 Fridge `0~4°C`、冷冻 Freezer `-18°C` 三种温区下的保质天数区间）。
2. **腐坏风险（Spoilage Risk）三档確定性评分公式**：
   - 设当前日期为 $T_{\text{now}}$，到期日为 $T_{\text{exp}}$，剩余天数 $D = \lceil (T_{\text{exp}} - T_{\text{now}}) / \text{1 day} \rceil$。
   - **High Risk（高风险 · 危险红 `#EF4444` / 浅红底 `#FEE2E2`）**：
     - 满足任一条件：① $D \le 1$ 天（明天或今天到期/已过期）；② 日期类型为 **`use-by`（安全食用期限）** 且 $D \le 2$ 天（涉及食品安全红线，如鲜鸡胸肉、鲜牛奶、生鱼片，必须升级预警并提供“立即彻底加热烹饪或冷冻”动作建议）。
   - **Medium Risk（中风险 · 琥珀黄 `#F59E0B` / 浅黄底 `#FEF3C7`）**：
     - 满足条件：日期类型为 `best-before` 且 $2 \le D \le 3$ 天，或 `use-by` 且 $D = 3$ 天（提示近三天内优先排入晚餐计划）。
   - **Low Risk（低风险 · 品牌绿 `#16A34A` / 浅绿底 `#E7F6ED`）**：
     - 满足条件：$D \ge 4$ 天（状态良好，正常储存）。

### 3.3 第三层：决策与推荐层（Rescue Recipes 抢救菜谱 Agent 与 SDG 减废核算）

1. **抢救菜谱推荐引擎（Hybrid Rule + AI Recipe Agent）**：
   - **MVP 阶段采用「本地精品菜谱库集合匹配 + AI 动态生成兜底」混合模式**：
     - **集合匹配评分算法（零延迟、零成本）**：内置 50~100 道贴合香港及粤式/西式简餐习惯的快手菜谱（如原型中的 *Spinach & Chicken Power Bowl*、*Tomato-Yoghurt Dip*、*Sourdough Bread Pudding* 以及粤式滑蛋牛肉、番茄煮豆腐等）。菜谱匹配度计算公式为：
       $$\text{Match Score} = \frac{\sum_{i \in I_{\text{recipe}} \cap I_{\text{fridge}}} w_i}{\sum_{j \in I_{\text{recipe}}} w_j} \times 100\%$$
       其中临期高风险食材权重 $w_{\text{high}} = 3.0$，中风险食材权重 $w_{\text{medium}} = 2.0$，普通在库食材权重 $w_{\text{low}} = 1.0$。这样能确保**消耗最多临期高风险食材的菜谱永远排在第一位**。
     - **AI 创意清冰箱 Agent（按需触发）**：当用户冰箱里的临期食材组合较为奇特、静态库匹配度低于 60% 时，点击“AI 生成专属抢救菜谱”，调用 LLM Agent（传入当前 High/Medium 风险食材清单、用户厨具限制如“仅微波炉/空气炸锅”、烹饪时长 $\le 20$ 分钟），实时生成结构化菜谱并在底部附上免责提示。
   - **一键核销闭环（`Mark as Cooked`）**：用户点击菜谱弹窗中的“Mark as cooked”后，后端通过数据库事务自动扣减对应在库食材的克重/数量，并将成功消耗的临期食材重量记入 `waste_logs`（ステータス为 `rescued`），驱动首页 KPI 与 Impact 屏数据实时增长。
2. **联合国可持续发展目标（SDG 12.3 / 12.5 / 13.3）量化核算公式**：
   - **减少食物浪费量（Food Waste Saved, kg）**：统计自然月内所有在到期前被标记为 `rescued`（且消耗时处于 High 或 Medium 风险窗口）的食材净重总和：
     $$W_{\text{saved}} = \sum_{k \in \text{Rescued}} m_k \text{ (kg)}$$
   - **估算节省金额（Est. Money Saved, HK$）**：优先累加收据扫描录入的实际购买单价；若无小票单价，则按分类平均参考单价（如肉类 HK$120/kg、乳制品 HK$45/kg、蔬果 HK$35/kg、烘焙 HK$50/kg）自动折算。
   - **碳减排当量（$\text{CO}_2\text{e}$ Avoided, kg）**：依据联合国粮农组织（FAO）与香港环保署（EPD）食物生命周期碳足迹系数，按品类加权计算（或 MVP 阶段采用家庭混合厨余平均排放因子 $1.28 \sim 2.5\text{ kg CO}_2\text{e / kg 食物}$；原型中 `3.2 kg` 节省食物对应 `4.1 kg CO₂e`，即综合系数约为 $1.28125$），实现与原型数据 100% 严丝合缝。

### 3.4 第四层：界面展示层与视觉重构规划

- **MVP 阶段（v1.x）**：直接继承 `FreshTrack_HK_mockups_v1.1` 的 **13 色 Design Tokens**（深绿 `#0B3B2E`、品牌绿 `#16A34A`、三档风险高对比度浅底深字徽章）与五屏骨架（`Home / Dashboard`、`My Fridge`、`Recipes`、`Add Item`、`Impact`）。
- **后期大改版准备（UI/UX 设计系统解耦）**：考虑到你提到“前端风格后面大概率要大改一版”，我们在工程架构上必须实行 **Headless 逻辑与样式彻底分离**——所有颜色、圆角、阴影、间距全部定义为 CSS Variables（`--bg-canvas`、`--brand`、`--risk-high-bg` 等）与 Tailwind CSS 主题配置，业务逻辑全部封装在 Vue Composables（`useFridgeStore`、`useScanner`、`useRecipes`）中。后期视觉大改时，只需替换样式变量与 UI 组件壳，**后端接口与前端状态管理代码一行都不用改**。

---

## 四、 MVP 核心功能范围（MoSCoW 优先级）、数据库设计与 API 契约

### 4.1 MVP 功能范围界定（MoSCoW 矩阵）

| 优先级分级 | 模块归属 | 功能项名称 | 详细验收标准（Definition of Done） |
| :--- | :--- | :--- | :--- |
| **Must Have**<br>（MVP 必做，支撑核心闭环） | 数据输入层 | 三合一食材录入（收据扫描 + 拍照识别 + 手动录入） | 接入 Gemini 2.5 Flash 视觉接口，支持上传小票或食材照片解析出名称、分类、数量、日期类型（`best-before` / `use-by`）与到期日，支持人工二次确认修改后入库。 |
| **Must Have** | 规则与估算层 | 腐坏风险三档自动计算与分类筛选 | 入库后自动根据公式计算 `High / Medium / Low` 风险等级，My Fridge 页支持按五大分类（Produce/Dairy/Meat/Bakery/Pantry）及 `High risk only` 过滤排序。 |
| **Must Have** | 决策与推荐层 | Rescue Recipes 抢救菜谱匹配与一键核销 | 根据当前临期食材自动计算匹配度百分比，展示菜谱详情弹层（配料高亮临期项 + 步骤），点击 `Mark as cooked` 扣减库存并累计减废数据。 |
| **Must Have** | 展示与合规层 | Dashboard 九大模块联动与食品安全免责声明 | 首页 4 大 KPI 卡片、Use Soon 预警列表、SDG 12.3 统计图表由真实数据库驱动；全站固定展示 `best-before` 与 `use-by` 食品安全边界提示条。 |
| **Should Have**<br>（V1.1 紧随迭代） | 输入与触达 | 条形码扫码入库 + 每日临期消息推送 | 接入 Open Food Facts 条码库；配置每日早 8:00 定时任务，对 `D <= 2` 的食材发送微信订阅消息或浏览器通知。 |
| **Could Have**<br>（V2.0 进阶阶段） | 协同与智能 | 家庭多成员共享冰箱 + 动态 AI 菜谱生成 + 智能补货单 | 支持微信群/邀请码共享同一个家庭冰箱账本；食材不足或消耗完后一键加入采购清单（Shopping List）。 |
| **Won't Have**<br>（MVP 明确不做） | 硬件与重社区 | 智能冰箱硬件摄像头直连、社区晒单社交圈、生鲜电商直购结算 | MVP 阶段严控边界，避免硬件适配泥潭与过早引入高昂的电商供应链开发成本。 |

### 4.2 核心数据库表结构设计（PostgreSQL / Supabase Schema）

为支撑上述 MVP 闭环，后端数据库仅需 **5 张核心表**，结构清晰且具备极强的扩展性：

| 表名 | 核心字段定义（字段名 : 类型 — 说明） | 核心索引与设计说明 |
| :--- | :--- | :--- |
| **`profiles` / `households`**<br>（用户与家庭冰箱表） | `id` (UUID, PK), `name` (TEXT), `Owner_id` (UUID), `invite_code` (TEXT), `monthly_budget_hkd` (NUMERIC), `created_at` (TIMESTAMPTZ) | 支持单人默认冰箱，同时预留 `household_id` 字段，为后期多人共享同一个家庭冰箱无缝铺路。 |
| **`storage_rules`**<br>（生鲜储存规则字典表） | `id` (SERIAL, PK), `keyword_en` (TEXT), `keyword_zh` (TEXT), `category` (ENUM: produce/dairy/meat/bakery/pantry), `default_zone` (ENUM: fridge/freezer/pantry), `default_shelf_life_days` (INT), `default_date_type` (ENUM: best_before/use_by), `avg_price_per_kg_hkd` (NUMERIC), `co2e_factor` (NUMERIC) | 预置 150+ 条标准生鲜规则（基于 USDA FoodKeeper 汉化与香港本地化），用于小票未印保质期时的智能兜底推算与碳排折算。 |
| **`fridge_items`**<br>（冰箱在库食材明细表） | `id` (UUID, PK), `household_id` (UUID, FK), `name` (TEXT), `category` (TEXT), `quantity` (NUMERIC), `unit` (TEXT: g/ml/pcs/L), `weight_grams` (INT), `price_hkd` (NUMERIC), `purchase_date` (DATE), `expiry_date` (DATE), `date_type` (ENUM: `best_before` / `use_by`), `storage_zone` (TEXT), `risk_level` (ENUM: `high` / `medium` / `low`), `status` (ENUM: `in_stock` / `consumed` / `discarded`), `source_method` (ENUM: `receipt` / `photo` / `manual` / `barcode`) | 核心业务表。在 `household_id + status + expiry_date` 上建立联合索引，支持毫秒级查询 `Use Soon` 临期列表。 |
| **`recipes`**<br>（抢救菜谱库表） | `id` (UUID, PK), `title` (TEXT), `prep_time_min` (INT), `difficulty` (TEXT), `servings` (INT), `ingredients` (JSONB: `[{name, category, amount_g, is_core}]`), `steps` (JSONB: `[string]`), `tags` (TEXT[]) | `ingredients` 采用 JSONB 存储，方便与 `fridge_items` 进行集合交集计算与临期权重匹配。 |
| **`waste_impact_logs`**<br>（减废与 SDG 行为流水表） | `id` (UUID, PK), `household_id` (UUID, FK), `item_id` (UUID, FK), `action_type` (ENUM: `rescued_by_recipe` / `consumed_direct` / `expired_discarded`), `weight_grams` (INT), `money_saved_hkd` (NUMERIC), `co2e_avoided_kg` (NUMERIC), `logged_at` (TIMESTAMPTZ) | 每次用户点击 `Mark as cooked` 或手动清理食材时写入一条流水，用于聚合生成首页月度 KPI 与 Impact 页近 6 个月柱状图。 |

### 4.3 前后端核心接口契约（REST / Edge Functions API 清单）

| 接口路径 / 云函数名 | 请求方式 | 功能描述 | 核心入参 (Request) | 核心出参 (Response) |
| :--- | :--- | :--- | :--- | :--- |
| `/functions/v1/ai-scan-receipt` | `POST` | AI 扫描超市收据并返回结构化食材列表 | `{ image_base64: string, store_hint?: string }` | `{ items: [{ name, category, quantity, unit, weight_g, price_hkd, date_type, suggested_expiry_date, confidence }] }` |
| `/functions/v1/ai-scan-food` | `POST` | AI 拍摄食材/包装识别名称与保质期喷码 | `{ image_base64: string, mode: "item" \| "shelf" \| "label" }` | `{ detected_items: [{ name, category, date_type, expiry_date, is_estimated, storage_advice }] }` |
| `/rest/v1/fridge_items` | `GET / POST / PATCH` | 获取在库食材列表、批量确认入库、更新状态 | 查询参数：`?status=eq.in_stock&order=expiry_date.asc` | 返回带实时计算 `days_left` 与 `risk_level` 的食材数组 |
| `/functions/v1/match-recipes` | `GET / POST` | 获取按临期抢救率排序的推荐菜谱（支持 AI 实时生成） | `{ household_id: string, use_ai_fallback?: boolean }` | `{ recipes: [{ id, title, match_score, expiring_used_count, waste_saved_kg, ingredients, steps }] }` |
| `/functions/v1/cook-recipe` | `POST` | 确认烹饪菜谱，事务扣减库存并写入 SDG 减废流水 | `{ recipe_id: string, consumed_item_ids: string[] }` | `{ updated_kpi: { total_tracked, expiring_soon, month_saved_kg, month_saved_hkd, co2e_kg } }` |

---

## 五、 当前可立即启动的开发事项拆解（4 周敏捷冲刺排期）

为了方便你和团队直接照单开发，我将从零到 MVP 上线的全过程拆解为 **4 个 Sprint（周度冲刺）共 16 项具体工程任务**：

| 阶段周期 | 模块领域 | 任务编号与具体开发事项 | 交付物与验收标准 |
| :--- | :--- | :--- | :--- |
| **Week 1**<br>基础基建与数据库搭建 | 后端 / 数据库 | **T1.1 初始化 Supabase 项目与执行建表 SQL**<br>创建云端 PostgreSQL 实例，运行 `schema.sql` 建立 5 张核心表与 RLS（行级安全策略）。 | Supabase 控制台表结构就绪，拿到 `SUPABASE_URL` 与 `ANON_KEY`。 |
| **Week 1** | 数据 / 规则层 | **T1.2 导入生鲜储存规则种子数据 (`seed_rules.sql`)**<br>整理香港常见 100 种生鲜（蔬菜、冻肉、鲜奶、烘焙、干货）的默认保质期、温区、均价与碳排系数。 | `storage_rules` 表包含完整中英双语映射数据，支持模糊匹配。 |
| **Week 1** | 前端工程化 | **T1.3 搭建前端工程骨架与 Design Tokens 抽离**<br>将 `FreshTrack_HK_mockups_v1.1` 中的 CSS 色板与五屏组件拆分为模块化工程（支持 Web + 小程序编译）。 | 本地 `npm run dev` 可跑通五屏路由切换，保留后续一键换肤能力。 |
| **Week 2**<br>AI 视觉 Agent 与入库闭环 | AI / 后端云函数 | **T2.1 开发收据扫描与拍照识别云函数 (`ai-scan`)**<br>接入 Google Gemini 2.5 Flash API，编写 System Prompt 与 JSON Schema 强约束输出，区分 `best-before` 与 `use-by`。 | 传入真实百佳/惠康超市小票或牛奶盒照片，3 秒内返回标准 JSON 数组。 |
| **Week 2** | 前端 / Add 页 | **T2.2 实现 Add Item 页真实拍照、图片压缩与结果确认流**<br>将原型中的 `Simulate scan` 替换为真实相机/相册调用，展示解析出的食材列表，支持手调日期后批量写入 `fridge_items`。 | 拍照上传 -> AI 解析 -> 勾选确认 -> 跳转 My Fridge 看到新增食材。 |
| **Week 2** | 前端 / Fridge 页 | **T2.3 对接 My Fridge 库存列表、分类过滤与高风险筛选**<br>实现腐坏风险三档动态徽章渲染，支持五大分类 Tab 切换、关键词搜索与 `High risk only` 过滤。 | 数据全部来自云端数据库，修改或删除食材后界面即时响应。 |
| **Week 3**<br>抢救菜谱引擎与 SDG 闭环 | 后端 / 算法层 | **T3.1 实现 Rescue Recipes 临期匹配算法与菜谱种子库**<br>录入 30+ 道精选抢救菜谱，编写基于高/中风险食材权重的匹配度评分函数，并接入 AI 动态菜谱生成兜底。 | Recipes 页与首页 Rescue 卡片按真实在库临期食材动态排序。 |
| **Week 3** | 全栈 / 核销闭环 | **T3.2 打通 `Mark as cooked` 核销事务与 Impact 统计图表**<br>点击烹饪完成按钮后，自动扣减对应食材库存，写入 `waste_impact_logs`，并实时聚合近 6 个月减废趋势图与 SDG 12.3 指标。 | 形成“录入 -> 预警 -> 煮菜消耗 -> 减废省钱统计”完整正向闭环。 |
| **Week 4**<br>消息触达、合规打磨与上线 | 后端 / 定时任务 | **T4.1 配置每日临期巡检 Cron 任务与通知推送**<br>每日早 8:00 自动重算全库食材剩余天数，更新 `risk_level`，对 `High Risk` 食材触发提醒。 | 临期食材状态每日自动演进，首页顶栏待处理数字准确更新。 |
| **Week 4** | 测试 / 部署交付 | **T4.2 端到端联调、免责声明合规检查与生产环境部署**<br>检查全站 `use-by` 安全警示标识与免责横幅，Web 端一键部署至 Vercel，小程序端上传体验版二维码。 | 产出可公开访问的生产级链接与 GitHub 完整源码仓库。 |

---

## 六、 产品中长期演进路线图（V1.0 MVP → V2.0 智能协同 → V3.0 商业生态）

在 MVP 跑通单点家庭闭环后，产品可以沿着**“降本提效（更准的 AI）→ 关系链裂变（家庭协同）→ 商业变现与社会价值（B2B2C 生鲜生态）”**三个阶段深入演进：

### 6.1 V1.5 ~ V2.0：深度智能化与家庭多端协同阶段（上线后 2~4 个月）
1. **家庭共享冰箱（Multi-user Household Sync）**：
   - 支持通过微信转发邀请卡片或 6 位家庭口令，让夫妻、室友、家中长辈或菲佣/印佣共同维护同一个冰箱账本（支持中/英/印多语言界面一键切换，极度贴合香港家庭结构）。
   - 实时同步动态（如“妈妈刚刚通过小票录入了 6 件食材”、“Douglas 今晚认领了菠菜鸡胸肉能量碗”）。
2. **智能常备品补货与逆向采购清单（Smart Shopping List）**：
   - 为牛奶、鸡蛋、吐司等高频消耗品设置“最低安全水位线”。当用户点击 `Mark as cooked` 导致库存归零，或某件食材因过期被丢弃时，系统自动询问是否加入下周采购清单，并在用户在超市购物时提示“家里还有 2 盒酸奶明天到期，切勿重复购买”。
3. **个性化饮食偏好与营养健康 Agent（Nutrition & Allergy Guard）**：
   - 在菜谱推荐层叠加家庭成员健康画像（如减脂高蛋白、控糖、乳糖不耐受、痛风低嘌呤、清真/素食），让 Rescue Recipes 不仅“帮冰箱清库存”，更能“帮家人做营养配餐”。
4. **冰箱实拍层架全景对比（Shelf Snapshot Diff）**：
   - 用户每周打开冰箱门拍一张全景照，VLM 视觉 Agent 自动对比上周照片与当前账本，识别出“已被吃掉但忘记录入核销的食材”或“角落里被遮挡遗忘的酱料瓶”。

### 6.2 V3.0：商业化生态与 ESG / SDG 社会价值闭环（上线后 6~12 个月）
1. **香港本地生鲜商超与临期盲盒联动（B2B2C O2O 导流）**：
   - 当推荐的抢救菜谱已经有 3 样主料（如临期鸡胸肉和菠菜），仅缺 1 样辅料时，提供一键跳转 HKTVmall、百佳或惠康补齐缺件（CPS 佣金分成）；或与本地烘焙店/超市合作推送周边晚间“临期折价惜食盲盒（类似 Too Good To Go / Yindii 模式）”。
2. **碳普惠与绿色积分激励体系（Green Carbon Credits）**：
   - 将用户在 Impact 页面积累的真实减废重量（kg）与碳减排量（$\text{CO}_2\text{e}$）转化为可验证的“惜食绿叶积分”，与香港环保署（EPD）「绿在区区」或本地 ESG 品牌合作兑换环保袋、咖啡券或超市现金券。
3. **スマート家电 IoT 开放接口（Smart Appliance API）**：
   - 开放标准 Webhook / Matter 协议接口，未来可与带机身屏幕或内部摄像头的智能冰箱（如 Samsung Family Hub、LG ThinQ、美的/海尔智能冰箱）及便携式蓝牙热敏标签机（一键打印带二维码和到期日的冰箱贴纸）硬件互联。

---

## 七、 GitHub 仓库工程结构规范（Ready-to-Push 脚手架设计）

为了让你创建 GitHub 仓库后团队能立即克隆并开始协作，我已经为你规划并生成了一套标准的 **Monorepo 全栈仓库目录结构**：

```text
freshtrack-hk/
├── README.md                          # 项目中英双语总览、架构图、快速启动指南与技术栈说明
├── docs/
│   ├── PRD_MVP_and_Roadmap.md         # 产品策划、MVP 功能说明书与未来演进路线图（Markdown 版）
│   ├── API_SPEC.md                    # 前后端接口契约与 AI Agent Prompt 规范文档
│   └── DESIGN_TOKENS.md               # 13 色语义色板、排版规范与后续 UI 改版解耦指南
├── prototypes/                        # 现有高保真可点击原型归档（供开发对照）
│   ├── FreshTrack_HK_web_dashboard.html
│   └── FreshTrack_HK_mobile_app.html
├── backend/
│   ├── supabase/
│   │   ├── schema.sql                 # PostgreSQL 5 张核心表结构、枚举与索引定义
│   │   └── seed_storage_rules.sql     # 常见生鲜食材储存规则与碳排系数初始数据
│   └── functions/
│       └── ai-scan-service.ts         # 基于 Gemini 2.5 Flash 的小票/食材/保质期识别云函数模板
└── frontend/
    ├── package.json                   # 前端工程依赖配置（Vue 3 / Uni-app / Tailwind CSS）
    └── src/
        ├── styles/tokens.css          # 抽离自原型的全局 CSS 变量（支持一键换肤改版）
        └── utils/riskCalculator.ts    # 腐坏风险三档评估与 SDG 减废核算核心纯函数
```

---