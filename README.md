# EventSim

EventSim 是一个面向 Hackathon 演示的交互式事件模拟器。  
它把一个事件拆成「反事实分支 + 角色视角」，帮助用户快速比较不同选择会如何影响结果。

## 1. 这个项目目前做了什么

当前版本已经实现完整 MVP（可直接演示）：

- 输入事件文本，生成模拟图谱（1 个 root + 3 个世界 + 每个世界 3 个角色节点）
- 三种反事实距离：
  - `minimal`（最小改动）
  - `moderate`（中等改动）
  - `radical`（激进改动）
- 三种固定角色视角：
  - `you_now`
  - `you_5y`
  - `neutral_advisor`
- 点击节点按需展开详情（懒加载）：
  - `consequences`（3 条）
  - `why_it_changes`
  - `next_question`
  - `risk_flags`
- Compare 模态框（节点 A/B 对比：changed / diverged / stable）
- Demo Mode（本地预生成 JSON，断网也可展示）
- 导出当前图谱为 JSON、复制摘要到剪贴板
- 后端缓存（文件缓存）+ 简单限流 + 安全拦截（医疗/法律/自伤类）

注意：当前生成逻辑是**稳定的后端规则生成**（非在线 LLM 调用），用于保证演示可靠性和成本可控。

## 2. 技术栈与架构

- Frontend: React + Vite + React Flow + React Router
- Backend: Node.js + Express
- Cache: `backend/cache/*.json`
- Demo Data: `backend/demo/*.json`

核心接口：

- `POST /api/plan`：生成图谱骨架
- `POST /api/expand`：按节点展开详情
- `GET /api/demo/:id`：读取预生成 demo 场景

## 3. 环境要求

- Node.js 18+（建议 20+）
- npm 9+

## 4. 一步一步启动（明确指令）

请开两个终端窗口。

### 4.1 启动后端

```bash
cd backend
npm install
npm run dev
```

默认地址：`http://localhost:8787`

可选（自定义端口）：

```bash
# Windows PowerShell
$env:PORT=8788
npm run dev
```

### 4.2 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:5173`

可选（自定义后端地址）：

```bash
# Windows PowerShell
$env:VITE_API_URL="http://localhost:8787"
npm run dev
```

### 4.3 打开页面

- 首页：`/`
- 主模拟器：`/sim`
- Demo 模式：`/demo`

## 5. 使用说明（建议按这个流程演示）

1. 打开 `/demo`，点击 `Demo: Offer Decision`，展示“秒开”能力。
2. 进入 `/sim`，选择模板或输入事件文本。
3. 点击 `Generate Graph`，生成图谱。
4. 点击任意 World/Role 节点，右侧面板会加载结构化详情。
5. 点击 `Pin` 固定两个节点，点 `Compare` 展示差异。
6. 点击 `Export JSON` 导出当前结果。
7. 点击 `Copy Summary` 复制结论摘要。

## 6. API 使用示例

### 6.1 生成图谱

```bash
curl -X POST http://localhost:8787/api/plan \
  -H "Content-Type: application/json" \
  -d "{\"eventText\":\"I have two job offers and need to choose.\",\"options\":{\"timeframe\":\"1 year\",\"stakes\":\"high\",\"goal\":\"growth\",\"worldCount\":3,\"roleCount\":3}}"
```

### 6.2 展开节点

```bash
curl -X POST http://localhost:8787/api/expand \
  -H "Content-Type: application/json" \
  -d "{\"eventHash\":\"<from-plan-meta>\",\"nodeId\":\"world_a_you_now\"}"
```

### 6.3 加载 Demo 场景

```bash
curl http://localhost:8787/api/demo/offer-decision
```

## 7. 目录结构

```text
EventSim/
  frontend/
    src/
      components/
      pages/
      lib/
  backend/
    src/index.js
    prompts/
    demo/
    cache/
  docs/
    ARCHITECTURE.md
    DEMO.md
    IDEAS.md
  assets/
```

## 8. 安全与边界

- 本项目用于反思和探索，不提供专业医疗/法律/危机干预建议。
- 若输入涉及高风险类别，后端会返回拦截提示而不是继续生成。

## 9. 常见问题（FAQ）

### Q1: 为什么点击节点没有详情？
- 请先执行一次 `Generate Graph`，确保有 `eventHash`。
- 检查后端是否在 `8787` 端口运行。

### Q2: 为什么 Demo 页面只有标题，不显示完整图？
- `offer-decision` 是完整 demo 图谱。
- 其他 demo（`interview-outcome`、`team-conflict`）目前是轻量占位，可继续扩展。

### Q3: 缓存在哪里？
- 在 `backend/cache/`，按请求 key 写入 JSON 文件。

## 10. 下一步可扩展项

- 接入真实 LLM（OpenAI/Anthropic）替换规则生成
- 增加 Share Link（SQLite 持久化）
- 增强 compare（变量贡献热度）
- 增加“编辑某个 counterfactual 后单点重生成”

---

更多设计与演示文档：

- `docs/ARCHITECTURE.md`
- `docs/DEMO.md`
