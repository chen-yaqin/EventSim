# EventSim

**Explore decisions as branching futures.**

EventSim is a hackathon-ready interactive simulation tool that turns one event into multiple possible futures, compares outcomes, and helps users reason through tradeoffs from different role perspectives.

## Why EventSim

Most decision tools are linear. Real decisions are not.

EventSim helps you answer:

- What happens if we choose Path A vs Path B?
- Which branch is safer, bolder, or more robust?
- How does this look from different stakeholder roles?
- What should we test next before committing?

## What Makes It Demo-Strong

- Fast graph generation from one event prompt
- Click-to-expand branch intelligence (`consequences`, `why`, `risk`, `next question`)
- Double-click branching for deeper what-if exploration
- Two-branch compare (`Pros / Cons / Risks`) with exportable conclusion
- Role chat with both preset roles and **Custom Role**
- Lineage timeline window for explainable branch history
- Built-in fallback + cache for reliable live demos

## Core Features

- **Counterfactual Graph**: root + world nodes with `minimal / moderate / radical` divergence
- **Lazy Detail Expansion**: load analysis only when needed
- **Branching Engine**: configurable child count per node
- **Role Chat**:
  - `You-Now`
  - `You-in-5-Years`
  - `Neutral Advisor`
  - `Custom Role` (name + style)
- **Branch Compare**: side-by-side cards for `Pros / Cons / Risks`
- **Lineage Window**: timeline steps, breadcrumb, detail modal
- **Export**: graph JSON + compare conclusion text

## Screens and Flow

1. Enter an event in `/sim`
2. Generate graph
3. Single-click a node to inspect details
4. Double-click a world node to branch
5. Select two nodes and run compare
6. Use role chat to pressure-test decisions
7. Open lineage window to present branch history

## Quick Start

### Prerequisites

- Node.js 18+ (20+ recommended)
- npm 9+

### 1) Configure Backend Environment

Create `backend/.env` from `backend/.env.example`.

```bash
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_VERSION=2023-06-01
ANTHROPIC_API_URL=https://api.anthropic.com/v1/messages

ANTHROPIC_MODEL=claude-3-5-haiku-latest
ANTHROPIC_MODEL_BASIC=claude-3-5-haiku-latest
ANTHROPIC_MODEL_CHATBOT=claude-3-5-sonnet-latest
ANTHROPIC_MODEL_BRANCH=claude-3-5-sonnet-latest
```

If no API key is set, fallback logic still supports demo usage.

### 2) Run Backend

```bash
cd backend
npm install
npm run dev
```

Default: `http://localhost:8787`

### 3) Run Frontend (Dev)

```bash
cd frontend
npm install
npm run dev
```

Default: `http://localhost:5173`

Optional frontend API override:

```powershell
$env:VITE_API_URL="http://localhost:8787"
npm run dev
```

### 4) Open Routes

- Home: `/`
- Simulator: `/sim`
- Demo list: `/demo`

## Deployment & Sharing

### Option A: Single-command bundled run

Use one command to build frontend and run backend:

```bash
cd backend
npm install
npm run start:bundle
```

Service URL:

- `http://localhost:8787/`
- `http://localhost:8787/sim`

### Option B: LAN sharing (same Wi-Fi)

1. Find host LAN IP (example: `10.140.214.226`)
2. Ensure backend is running on `8787`
3. Allow inbound `TCP 8787` in firewall
4. Share `http://<LAN_IP>:8787/`

### Option C: Temporary public link

Expose local port `8787` with a tunnel tool:

```powershell
npx localtunnel --port 8787
```

Share the generated `https://*.loca.lt` link.
Stop tunnel with `Ctrl + C`.
## User Instructions

### Simulator Basics

- Enter your event and click **Generate Graph**
- **Single click** node: select + load details
- **Double click** world node: open branch modal
- Use **Collapse/Expand** to manage tree visibility

### Branch Compare

- Select two nodes using `Compare`
- Click **Branch Compare**
- Review side-by-side:
  - Pros
  - Cons
  - Risks
- Export summary with **Export Conclusion**

### Role Chat

- Open **Role Chat**
- Choose preset role or **Custom Role**
- For custom role, provide:
  - role name
  - role style
- Ask scenario-specific questions tied to selected node

### Lineage Window

- Open from side panel
- Follow timeline sequence and breadcrumb
- Click steps to inspect detail modal

## Architecture

- Frontend: React + Vite + React Flow + React Router
- Backend: Node.js + Express
- Provider routing: Anthropic/OpenAI/Gemini + deterministic fallback
- Cache: JSON files in `backend/cache`

## Repository Structure

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

## Reliability and Safety

- Rate-limited endpoints for stability
- File cache for repeatable runs
- Restricted-content guardrails (e.g. self-harm, medical/legal advice categories)
- Fallback generation path for provider failures

## Troubleshooting

### Graph generated but no detail expansion

- Ensure backend is running and reachable from frontend
- Ensure a valid `eventHash` exists (generate graph first)

### Chat custom role not working

- `roleId` must be `custom`
- `customRoleTitle` cannot be empty

### Output feels stale

- Restart backend/frontend
- Cache is file-based (`backend/cache`)

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/DEMO.md`
- `docs/IDEAS.md`
