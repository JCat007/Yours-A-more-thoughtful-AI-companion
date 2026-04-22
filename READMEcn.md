# Yours

英文说明见仓库根目录 [`README.md`](README.md)。

![Bella Avatar](./frontend/public/bella-avatar.png)

## Upgrade note / Breaking behavior change

- `POST /api/assistant/framework/switch` 的默认语义已从“仅运行时切换”变更为 `switchMode=full_migrate`。
- 默认会在 `openclaw -> hermes` 方向执行官方 `hermes claw migrate`（迁移人格/记忆/skills/配置，可选密钥）。
- 反向 `hermes -> openclaw` 时，`full_migrate` 也会在提交切换前把 canonical SOUL 同步到 OpenClaw workspace 目标路径。
- 若官方迁移失败，将返回 `SWITCH_HERMES_MIGRATION_FAILED`，并保持原框架不变（不提交切换）。
- 如需旧行为，请显式传 `switchMode=runtime_only`。

## Everlasting 与 Yours

Everlasting 是一个让人物在 AI 世界实现数字永生的尝试，其终极愿景是通过视频、图片、声音以及（记忆）数据合成技术，让数字人物像真人一样拥有感情、性格、爱好，并具备不断成长的能力。通过 Everlasting，每个人都可以真正地“重现”那些已经远去的人和场景，让珍贵的美好在赛博世界里永生。

Yours 是 Everlasting 的第一阶段产品，她是一个能够不断成长、善解人意的 AI 伴侣（目前仅开放 Bella 形象）。由于项目尚处于首次发布阶段，当前代码实现更侧重功能可用性，产品体验与视觉设计仍有待完善。详细的项目路线图与里程碑规划将在后续陆续公布。

---

## 架构概览

Yours 为单体仓库：**React + Vite** 前端、**Node** 后端、默认 **PostgreSQL**（启用伴侣记忆时需 **pgvector**），以及可选的 **OpenClaw / Hermes** 执行运行时承担重工具任务。对话链路按**意图先行、执行居中、人设收尾**组织，而不是单次扁平的大模型调用。

### 分层与职责

| 分层 | 作用 | 典型代码位置 |
|------|------|----------------|
| **意图（路由）LLM** | 将每轮输入分为闲聊、偏图像、偏任务等，并决定是否进入运行时执行路径。支持纯 LLM、纯规则或**混合**（LLM 低置信时回落规则）。存在上传时强制任务路径。 | `bellaIntentClassifier.ts`，`assistant.ts` 内路由 |
| **执行层** | 轻量 `chat_only` 可走**同步**直连模型以降低延迟；文件、图像、视频或多步任务进入 **Agent runtime path（运行时路径）**，依据用户框架与切换策略分发到 OpenClaw 或 Hermes。 | `assistant.ts`，`routes/assistant.ts`，`agent/AgentRuntimeRouter.ts` |
| **外层（人设）LLM** | **不会**把执行层原始日志直接给用户。在保留事实的前提下把执行结果改写成 Bella 口吻，并温和处理失败。系统人设与 SOUL 正文共同约束语气。 | `bellaComposer.ts`，`bellaOuterLlm.ts`，`bellaPersona.ts` |
| **OpenClaw** | 可选**执行器**，本仓库不内置。路由把工作派给网关后，由代理、工具与**技能**（文档、媒体、网页抽取等）完成。通过网关 URL、令牌与 agent id 等环境变量配置。 | 外部 CLI 与网关，详见 `docs/OPENCLAW_*.md` |
| **Hermes** | 可选**执行器**，由后端通过 Hermes CLI/runtime 调用。框架切换默认走 `switchMode=full_migrate`：OpenClaw -> Hermes 走官方迁移；Hermes -> OpenClaw 会把 canonical SOUL 同步到 OpenClaw workspaces。 | `agent/adapters/HermesAdapter.ts`，`agent/hermesRuntime.ts`，`agent/FrameworkSwitchService.ts` |
| **gbrain 与 Postgres** | **可选的长期伴侣记忆**。与 Bella 共用 **`DATABASE_URL`**；开启后由后端调用 **gbrain** CLI 做检索与写入。检索片段作为生文上下文注入（运行时路径会带范围提示，避免跨用户污染）。这是**记忆子系统**，不替代意图层或人设层 LLM。 | `gbrainCli.ts`，`companionChatBridge.ts`，`docs/COMPANION_AUTH_GBRAIN.md` |

**会话状态**（短期上下文、上一轮意图等）在 `bellaState.ts` 中维护，与 gbrain 的长周期存储相互独立。

### 端到端对话流程（`POST /api/assistant/chat`）

1. 接收消息、历史、上传与模式。  
2. 加载短期会话记忆。  
3. 运行路由，得到 `intent`、`confidence` 与运行时决策。  
4. 分支：同步文本，或进入 Agent runtime path（运行时路径，OpenClaw/Hermes，含下载与媒体等）。  
5. 若开启伴侣记忆，将 **gbrain** 检索结果并入本轮生文上下文。  
6. 调用**外层人设 LLM**生成最终对用户可见的回复。  
7. 返回 `reply`、`imageUrl`、`videoUrl`、`downloads`，异步任务场景下还可返回 `jobId`。

### 框架配置与切换 API

每个用户都持久化以下配置：

- `agentFramework`: `openclaw` 或 `hermes`
- `contextStrategyDefault`: `last_20_turns` 或 `full_with_summary`

当前接口：

- `GET /api/assistant/framework/config`
- `POST /api/assistant/framework/init`
- `POST /api/assistant/framework/switch`

`POST /api/assistant/framework/switch` 现支持两种语义（默认完整迁移）：

- `switchMode=full_migrate`（默认）：切换时除会话上下文迁移外，还会在 `openclaw -> hermes` 方向调用官方 `hermes claw migrate`，同步人格/记忆/skills/配置（可选密钥）。
- `switchMode=full_migrate`（默认）：`hermes -> openclaw` 方向会在提交框架切换前，将 canonical SOUL 同步到 OpenClaw workspace 候选路径。
- `switchMode=runtime_only`：仅切换运行时框架与上下文，不执行 Hermes 官方迁移。

快速排障（`Failed to start hermes migrate: spawn hermes ENOENT`）：

- 该错误表示后端进程在其执行环境中找不到可运行的 Hermes 二进制。
- 如果你已经在 WSL 内，请直接执行 `which hermes`（不要在 WSL 里再执行 `wsl ...`）。
- 若 Hermes 已安装在固定路径（例如 `$HOME/.venvs/hermes/bin/hermes`），请在 `backend/.env` 配置 `BELLA_HERMES_MIGRATE_CMD`。
- 示例：`BELLA_HERMES_MIGRATE_CMD=$HOME/.venvs/hermes/bin/hermes`

用户操作清单（可直接照做）：

```bash
# 1）打开 WSL 终端（Ubuntu）后执行：
which hermes

# 2）若无输出，但已知 Hermes 二进制存在，在 backend/.env 增加：
# BELLA_HERMES_MIGRATE_CMD=$HOME/.venvs/hermes/bin/hermes

# 3）重启后端，再次尝试框架切换。
```

请求体示例（推荐默认语义）：

```json
{
  "targetFramework": "hermes",
  "contextStrategy": "last_20_turns",
  "switchMode": "full_migrate",
  "migrateSecrets": true,
  "workspaceTarget": "/home/you/projects/your-workspace"
}
```

切换阻塞返回示例：

```json
{
  "ok": false,
  "code": "SWITCH_BLOCKED_NOT_IDLE",
  "message": "Current task is still running.",
  "blocking": {
    "activeJobs": 1,
    "inFlightRequests": 1
  }
}
```

切换成功返回示例：

```json
{
  "ok": true,
  "framework": "hermes",
  "switchMode": "full_migrate",
  "contextStrategy": "last_20_turns",
  "migration": {
    "strategy": "last_20_turns",
    "turnsMigrated": 24,
    "summaryIncluded": false
  },
  "frameworkMigration": {
    "mode": "full_migrate",
    "attempted": true,
    "command": "hermes claw migrate --yes --preset full",
    "followUps": [
      "Review Hermes migration output for archived items (e.g. HEARTBEAT.md / TOOLS.md).",
      "Start a new Hermes session so imported skills and memory are loaded."
    ]
  },
  "observability": {
    "pendingBackgroundWrites": 0,
    "gbrainRuntimeStable": true
  }
}
```

说明：

- 注册时可选初始框架。
- 设置中可手动切换框架。
- 当用户仍有活跃任务，或 chat 请求仍在处理中（进行中请求，in-flight request）时，切换会被阻塞。
- 当 `switchMode=full_migrate` 且方向为 `openclaw -> hermes`，若官方迁移失败，将返回 `SWITCH_HERMES_MIGRATION_FAILED`，并且不会提交框架切换（保持原框架）。
- 当 `switchMode=full_migrate` 且方向为 `hermes -> openclaw`，若 SOUL 同步失败，同样不会提交框架切换。
- 当 `migrateSecrets=true` 时，迁移会从本机 OpenClaw 配置/环境复制可识别的 provider key 值；前端 UI 不会展示明文密钥。

### 质量门禁与自动化冒烟测试（smoke）

后端冒烟测试命令：

- `npm run test:context-migration-smoke`
- `npm run test:framework-switch-smoke`
- `npm run test:skill-resolver-smoke`
- `npm run test:file-download-switch-smoke`
- `npm run test:phase9-smoke:json`

聚合测试报告产物（artifact）：

- `backend/reports/phase9-smoke-report.json`

CI 工作流（workflow）：

- `.github/workflows/phase9-smoke.yml`

### 示意图

```mermaid
flowchart TB
  subgraph client["浏览器 / 客户端"]
    UI[Yours 前端]
  end

  subgraph backend["Node 后端"]
    API["/api/assistant/chat"]
    FwCfg["框架配置接口\n/init + config + switch"]
    SwitchGate["切换门控（Switch gate）\nactive jobs + in-flight requests"]
    Router["Agent 运行时路由（runtime router）\nopenclaw / hermes"]
    Intent["意图路由 LLM\n（含规则、混合）"]
    Exec{"执行分支"}
    Sync["直连 LLM 完成\n（轻量闲聊）"]
    Rt["运行时分发\n（用户框架 + switch mode）"]
    OCJob["OpenClaw 路径\n（SSE 任务 + 工具技能）"]
    HermesRun["Hermes 路径\n（Hermes CLI 查询）"]
    Mem["gbrain CLI\n（可选检索 / 写入）"]
    Outer["外层人设 LLM\n（Bella 口吻）"]
    API --> Intent
    FwCfg --> SwitchGate
    Intent --> Exec
    Exec --> Sync
    Exec --> Rt
    Rt --> Router
    Router --> OCJob
    Router --> HermesRun
    Router --> Outer
    API -.->|开启时| Mem
    Mem -.-> Outer
    Outer --> UI
  end

  subgraph data["数据"]
    PG[(PostgreSQL\n+ pgvector)]
  end

  subgraph external["外部进程"]
    GW[OpenClaw 网关\nOpenAI 兼容 API]
    HC[Hermes CLI / runtime]
  end

  UI --> API
  OCJob <--> GW
  HermesRun <--> HC
  API --> PG
  Mem <--> PG
```

图例说明：

- `Rt` 表示运行时分发（由 `switchMode` 与用户框架偏好共同决定）。
- `Switch gate` 会在存在 active jobs 或 in-flight requests 时阻止框架切换。
- `OpenClaw 路径` 与 `Hermes 路径` 是同一 API 后面的并行执行分支。

更细的实现说明见 [`docs/ARCHITECTURE_AND_REFACTOR.md`](docs/ARCHITECTURE_AND_REFACTOR.md)。

---

## 快速安装

**前置条件：** Node.js 与 npm、Docker（本地默认数据库）、Git。

1. **克隆**本仓库，在仓库根目录打开终端。

2. **安装依赖**（每个克隆做一次）：

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. **后端环境**

   ```bash
   cp backend/.env.example backend/.env
   ```

   至少将 **`POSTGRES_PASSWORD`** 设为足够长的随机口令。除非使用外部数据库，否则可**不要**填写 **`DATABASE_URL`**，应用会根据 `POSTGRES_*` 自动拼连接串。

4. **数据库（在仓库根目录用 Docker）**

   ```bash
   npm run docker:db
   ```

5. **Prisma（在 `backend/` 下，首次正式跑之前执行）**

   ```bash
   cd backend
   npm run prisma:deploy
   npx prisma generate
   ```

6. **前端环境（可选）**  
   将需要的 `VITE_*` 变量写入 `frontend/.env` 或 `frontend/.env.local`（变量名见仓库根目录 `.env.example`）。

若计划使用 **gbrain**，**不要**只用官方 `postgres:16` 镜像而不带向量扩展，需要 **pgvector**（本仓库 Compose 已选用带 pgvector 能力的镜像）。细节见 [`docs/COMPANION_AUTH_GBRAIN.md`](docs/COMPANION_AUTH_GBRAIN.md)。

---

## 快速开始

1. **启动 Postgres**（若未运行）：在仓库根目录执行 `npm run docker:db`。

2. **后端**（终端 A）：

   ```bash
   cd backend
   npm run dev
   ```

   浏览器访问 **http://localhost:3001/health**，应看到含 `"status":"ok"` 的 JSON。

3. **前端**（终端 B）：

   ```bash
   cd frontend
   npm run dev
   ```

   浏览器打开 **http://localhost:5173** 进入 Bella 界面。

4. **首个账号**  
   用户表为空时可注册第一个账号。若已有用户仍需新注册，在 `backend/.env` 中设置 **`BELLA_ALLOW_REGISTER=1`**（详见伴侣记忆文档）。

5. **可选：OpenClaw 与 MiniMax（示例栈）**  
   按 [`docs/HANDS_ON_GUIDE.md`](docs/HANDS_ON_GUIDE.md) 配置 SOUL、网关与密钥。

6. **可选：gbrain 伴侣记忆**  
   在完成 Postgres 与 Prisma 后，对同一库执行 `gbrain init`，设置 **`GBRAIN_ENABLED=1`**，重启后端。完整步骤见 [`docs/COMPANION_AUTH_GBRAIN.md`](docs/COMPANION_AUTH_GBRAIN.md)。

**Windows 加 WSL 一键开发：** `scripts/dev-start.bat` 可在相关目录存在时启动网关、后端、前端及可选 Star Office。若自动探测失败，可复制 `scripts/dev-wsl.config.example.bat` 为 `scripts/dev-wsl.config.bat` 再改参数。依赖数据库的功能仍需你**自行**先完成 Prisma 迁移与 generate。

**生产构建**（仓库根目录）：

```bash
npm run build
```

依次执行后端 `tsc` 与前端 `tsc && vite build`。也可分别使用 `npm run build:backend` 或 `npm run build:frontend`。

---

## 文档索引

以下文档计划与 GitHub 仓库一并发布。表中为**文件名**及**文档主要内容**。

### 核心搭建与运维

| 文档 | 内容说明 |
|------|----------|
| [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md) | 最小本地运行：仅 `POSTGRES_PASSWORD`、Docker 数据库、Prisma、开发服务。 |
| [`docs/COMPANION_AUTH_GBRAIN.md`](docs/COMPANION_AUTH_GBRAIN.md) | 自建：Postgres 与 pgvector、Bun、gbrain 初始化、环境变量、Prisma、登录、伴侣记忆开关、运维重置密码。 |
| [`docs/ENVIRONMENT_SETUP.md`](docs/ENVIRONMENT_SETUP.md) | 环境文件规范、根目录与 `VITE_*`、云上密钥、CI 建议。 |
| [`NODE_AND_LOCALHOST.md`](NODE_AND_LOCALHOST.md) | Node 自检与 localhost、端口访问问题排查。 |
| [`docs/WSL_MIGRATION.md`](docs/WSL_MIGRATION.md) | WSL 下使用说明。 |
| [`docs/GITHUB_RELEASE_CHECKLIST.md`](docs/GITHUB_RELEASE_CHECKLIST.md) | 公开发布前检查清单。 |

### 架构与产品行为

| 文档 | 内容说明 |
|------|----------|
| [`docs/ARCHITECTURE_AND_REFACTOR.md`](docs/ARCHITECTURE_AND_REFACTOR.md) | 当前 Bella 栈：路由、执行、人设；请求路径；模块地图；后续重构设想。 |
| [`docs/OPENCLAW_DECISION_FLOW.md`](docs/OPENCLAW_DECISION_FLOW.md) | OpenClaw 输出形态、技能映射、URL 路由与主意图分类器关系、SOUL 与网关说明。 |
| [`docs/BELLA_CAPABILITIES_AND_SKILLS.md`](docs/BELLA_CAPABILITIES_AND_SKILLS.md) | Bella 能力与技能面（概览）。 |

### OpenClaw 网关与技能

| 文档 | 内容说明 |
|------|----------|
| [`docs/OPENCLAW_SETUP.md`](docs/OPENCLAW_SETUP.md) | 后端接入 OpenClaw 网关、HTTP 设置与 `backend/.env` 接线。 |
| [`docs/OPENCLAW_SKILLS_SETUP.md`](docs/OPENCLAW_SKILLS_SETUP.md) | 技能总索引与跨技能指引入口。 |
| [`docs/OPENCLAW_CHINA_WORLD_MODE.md`](docs/OPENCLAW_CHINA_WORLD_MODE.md) | OpenClaw 相关流程的中国区与海外区行为差异。 |
| [`docs/SKILL_CONVENTION_CHINA_WORLD.md`](docs/SKILL_CONVENTION_CHINA_WORLD.md) | 分区的技能编写约定。 |
| [`docs/OPENCLAW_PYTHON_VENV_UNIFIED.md`](docs/OPENCLAW_PYTHON_VENV_UNIFIED.md) | 技能侧 Python 虚拟环境统一约定。 |
| [`docs/OPENCLAW_SANDBOX_UPGRADE.md`](docs/OPENCLAW_SANDBOX_UPGRADE.md) | OpenClaw 沙箱升级说明。 |
| [`docs/OPENCLAW_WEB_FETCH_SSRF_AND_DNS.md`](docs/OPENCLAW_WEB_FETCH_SSRF_AND_DNS.md) | 网页抓取安全：SSRF 与 DNS 注意点。 |
| [`docs/WEATHER_SKILL_DIAGNOSTIC.md`](docs/WEATHER_SKILL_DIAGNOSTIC.md) | 天气技能排障。 |

**分技能安装指南**

| 文档 | 内容说明 |
|------|----------|
| [`docs/OPENCLAW_SKILL_PDF_SETUP.md`](docs/OPENCLAW_SKILL_PDF_SETUP.md) | PDF 技能。 |
| [`docs/OPENCLAW_SKILL_DOCX_SETUP.md`](docs/OPENCLAW_SKILL_DOCX_SETUP.md) | Word 与 DOCX 技能。 |
| [`docs/OPENCLAW_SKILL_PPTX_SETUP.md`](docs/OPENCLAW_SKILL_PPTX_SETUP.md) | PowerPoint 技能。 |
| [`docs/OPENCLAW_SKILL_XLSX_SETUP.md`](docs/OPENCLAW_SKILL_XLSX_SETUP.md) | Excel 技能。 |
| [`docs/OPENCLAW_SKILL_CANVAS_DESIGN_SETUP.md`](docs/OPENCLAW_SKILL_CANVAS_DESIGN_SETUP.md) | 画布与视觉设计技能。 |
| [`docs/OPENCLAW_SKILL_FRONTEND_DESIGN_SETUP.md`](docs/OPENCLAW_SKILL_FRONTEND_DESIGN_SETUP.md) | 前端与落地页类技能。 |
| [`docs/OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md`](docs/OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md) | 图像生成技能。 |
| [`docs/OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md`](docs/OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md) | 视频生成技能。 |
| [`docs/OPENCLAW_SKILL_WEB_TO_MARKDOWN_SETUP.md`](docs/OPENCLAW_SKILL_WEB_TO_MARKDOWN_SETUP.md) | 网页转 Markdown 技能。 |
| [`docs/OPENCLAW_SKILL_MARKITDOWN_SETUP.md`](docs/OPENCLAW_SKILL_MARKITDOWN_SETUP.md) | MarkItDown 基础安装。 |
| [`docs/OPENCLAW_SKILL_MARKITDOWN_INGEST_SETUP.md`](docs/OPENCLAW_SKILL_MARKITDOWN_INGEST_SETUP.md) | MarkItDown 摄取路径。 |
| [`docs/OPENCLAW_SKILL_MARKITDOWN_MULTIMODAL_SETUP.md`](docs/OPENCLAW_SKILL_MARKITDOWN_MULTIMODAL_SETUP.md) | MarkItDown 多模态安装。 |
| [`docs/OPENCLAW_SKILL_TAOBAO_SHOP_PRICE_SETUP.md`](docs/OPENCLAW_SKILL_TAOBAO_SHOP_PRICE_SETUP.md) | 淘宝店铺比价类技能。 |
| [`docs/OPENCLAW_SKILL_CHINA_E_COMMERCE_PRICE_COMPARISON_SKILLS_SETUP.md`](docs/OPENCLAW_SKILL_CHINA_E_COMMERCE_PRICE_COMPARISON_SKILLS_SETUP.md) | 国内电商比价相关技能。 |

### 提供商、部署与扩展

| 文档 | 内容说明 |
|------|----------|
| [`docs/BELLA_MINIMAX_SETUP.md`](docs/BELLA_MINIMAX_SETUP.md) | Bella 与 OpenClaw 侧的 MiniMax 提供方配置。 |
| [`docs/HANDS_ON_GUIDE.md`](docs/HANDS_ON_GUIDE.md) | 实操清单：MiniMax 密钥、SOUL、OpenClaw JSON、网关、curl 自测。 |
| [`docs/DEPLOY_AWS.md`](docs/DEPLOY_AWS.md) | AWS EC2、systemd 与 OpenClaw 网关一类部署。 |
| [`docs/AWS_APP_RUNNER_DEPLOY_BELLA.md`](docs/AWS_APP_RUNNER_DEPLOY_BELLA.md) | 面向 AWS App Runner 的部署说明。 |
| [`deploy/PUBLIC_DEPLOY.md`](deploy/PUBLIC_DEPLOY.md) | 公网推荐形态：网关仅本机回环、后端置于 TLS 之后、前端静态托管。 |
| [`docs/STAR_OFFICE_DEPLOY_AND_INTEGRATION.md`](docs/STAR_OFFICE_DEPLOY_AND_INTEGRATION.md) | Star Office 子模块部署与对接。 |
| [`docs/OPTIONAL_SUBMODULES.md`](docs/OPTIONAL_SUBMODULES.md) | 可选子模块模式（环境开关、路由、前端开关）。 |

### 模板

| 文档 | 内容说明 |
|------|----------|
| [`docs/templates/skill-china-world-example.md`](docs/templates/skill-china-world-example.md) | 分区技能文档示例。 |

---

## 主要入口文件（贡献者）

- `backend/src/routes/assistant.ts`：编排、任务、SSE、下载与媒体。  
- `backend/src/services/bellaIntentClassifier.ts`：意图分类。  
- `backend/src/services/assistant.ts`：模型提供方、OpenClaw、媒体辅助、gbrain 上下文挂钩。  
- `backend/src/services/bellaComposer.ts`：最终回复拼装。  
- `backend/src/services/bellaOuterLlm.ts`：外层人设 LLM。  
- `backend/src/services/bellaPersona.ts`：Bella 系统提示词。  
- `backend/src/services/bellaState.ts`：会话与意图记忆。

---

## OpenClaw 环境变量提示

网关不在本仓库内，需单独安装与配置。后端常见变量：**`OPENCLAW_GATEWAY_URL`**、**`OPENCLAW_GATEWAY_TOKEN`**（或兼容名）、**`OPENCLAW_AGENT_ID`**。
