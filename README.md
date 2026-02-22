# EventSim

EventSim is an interactive counterfactual simulation app designed for hackathon demos and rapid decision exploration.
It turns one event into a branching world graph, then lets users inspect each branch, chat from role perspectives, compare branches side-by-side, and continue branching deeper.

## Introduction

Most decision tools are linear. EventSim is intentionally non-linear:

- Start with one event.
- Generate multiple possible worlds (`minimal`, `moderate`, `radical`).
- Expand node details (`consequences`, `why_it_changes`, `next_question`, `risk_flags`).
- Continue branching from any world node.
- Compare two branches using `Pros / Cons / Risks`.
- Use role-based chat (`You-Now`, `You-in-5-Years`, `Neutral Advisor`, plus `Custom Role`) to test reasoning from different lenses.

This project is built for clear live demos:

- Fast startup
- Deterministic fallback behavior when model calls fail
- Cache-aware API flow
- Visual graph interaction with branch/depth control

## What Is Implemented

Current MVP includes:

- Graph generation from event input (`1 root + 3 world nodes`)
- Node detail expansion (lazy loaded)
- Branch generation from selected world nodes (custom child count)
- Role chat (preset roles + custom role)
- Branch compare modal with two-column `Pros / Cons / Risks`
- Lineage window with timeline, breadcrumb, and click-to-open details
- Node collapse/expand
- Demo mode (`/api/demo/:id`)
- Export graph JSON
- Backend cache + rate limiting + restricted-content guardrails

## Tech Stack

- Frontend: React, Vite, React Flow, React Router
- Backend: Node.js, Express
- Model provider: Anthropic API (with fallback)
- Cache: file-based JSON in `backend/cache/`

## Project Structure

```text
EventSim/
  frontend/
    src/
      components/
      pages/
      lib/
      styles.css
  backend/
    src/
      index.js
      config/
    cache/
    demo/
  docs/
  assets/
```

## API Overview

- `POST /api/plan` - Generate initial graph
- `POST /api/expand` - Expand one node's details
- `POST /api/branch` - Generate child worlds from a node
- `POST /api/chat` - Chat from a role perspective (supports custom role)
- `GET /api/demo/:id` - Load demo graph
- `GET /api/health` - Health check

## Instructions

### 1. Prerequisites

- Node.js 18+ (20+ recommended)
- npm 9+

### 2. Environment Setup

Create `backend/.env` from `backend/.env.example`.

Example:

```bash
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_VERSION=2023-06-01
ANTHROPIC_API_URL=https://api.anthropic.com/v1/messages

ANTHROPIC_MODEL=claude-3-5-haiku-latest
ANTHROPIC_MODEL_BASIC=claude-3-5-haiku-latest
ANTHROPIC_MODEL_CHATBOT=claude-3-5-sonnet-latest
ANTHROPIC_MODEL_BRANCH=claude-3-5-sonnet-latest
```

If `ANTHROPIC_API_KEY` is missing, backend fallback logic still allows demo usage.

### 3. Run Backend

```bash
cd backend
npm install
npm run dev
```

Default backend URL: `http://localhost:8787`

Optional custom port (PowerShell):

```powershell
$env:PORT=8788
npm run dev
```

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL: `http://localhost:5173`

Optional API URL override (PowerShell):

```powershell
$env:VITE_API_URL="http://localhost:8787"
npm run dev
```

### 5. Open App Routes

- Home: `/`
- Simulator: `/sim`
- Demo list: `/demo`

## Recommended Demo Flow

1. Open `/demo` and load a preset (quick proof of flow).
2. Open `/sim`, enter an event, and click `Generate Graph`.
3. Single-click a node to select and load details.
4. Double-click a world node to open branch modal and generate child worlds.
5. Select two nodes (`Compare`), then click `Branch Compare`.
6. Use `Role Chat` with preset roles or `Custom Role`.
7. Open `Lineage Window` to show timeline and branch history.

## API Examples

### Generate Plan

```bash
curl -X POST http://localhost:8787/api/plan \
  -H "Content-Type: application/json" \
  -d "{\"eventText\":\"I have two job offers and need to choose.\",\"options\":{\"timeframe\":\"1 year\",\"stakes\":\"high\",\"goal\":\"growth\"}}"
```

### Expand Node

```bash
curl -X POST http://localhost:8787/api/expand \
  -H "Content-Type: application/json" \
  -d "{\"eventHash\":\"<from-plan-meta>\",\"nodeId\":\"world_a\"}"
```

### Branch Node

```bash
curl -X POST http://localhost:8787/api/branch \
  -H "Content-Type: application/json" \
  -d "{\"eventHash\":\"<from-plan-meta>\",\"parentNodeId\":\"world_a\",\"parentTitle\":\"World A\",\"userQuestion\":\"What if we prioritize retention over speed?\",\"childCount\":4}"
```

### Chat (Preset Role)

```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"eventHash\":\"<from-plan-meta>\",\"nodeId\":\"world_a\",\"nodeTitle\":\"World A\",\"roleId\":\"you_now\",\"message\":\"What should I do first?\"}"
```

### Chat (Custom Role)

```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"eventHash\":\"<from-plan-meta>\",\"nodeId\":\"world_a\",\"nodeTitle\":\"World A\",\"roleId\":\"custom\",\"customRoleTitle\":\"Product Manager\",\"customRoleStyle\":\"user impact and scope-risk tradeoffs\",\"message\":\"What is the next best step?\"}"
```

## UX Notes

- Single click node: select + fetch details (if not cached)
- Double click world node: open branch modal
- Node tags are color-coded by semantic polarity (risk/benefit/action)

## Safety and Boundaries

EventSim is for exploration and reflection, not professional advice.
Restricted categories (e.g., self-harm, medical diagnosis, legal advice requests) are blocked by backend rules.

## Troubleshooting

### Node details are not loading

- Confirm backend is running on expected port.
- Ensure `/api/plan` was called first (valid `eventHash` required).

### Chat returns invalid role error

- Use one of: `you_now`, `you_5y`, `neutral_advisor`, `custom`.
- If `roleId=custom`, provide non-empty `customRoleTitle`.

### Old behavior appears after updates

- Restart backend and frontend dev servers.
- Cache is file-based (`backend/cache`), so prompt-version changes are used to bust stale responses.

## Docs

- `docs/ARCHITECTURE.md`
- `docs/DEMO.md`
- `docs/IDEAS.md`
