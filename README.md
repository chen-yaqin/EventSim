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

## Hackathon Compliance

This section records how our team satisfies the required submission conditions.

### Team and Track

- Track: General Track
- Team members:
  - Yaqin Chen
  - Runlin Song
  - Xiayu Zhao
- Team size is 3, which is within the General Track requirement (2-4 people).

### Dataset and Data Science Use

- Dataset used: FEMA disaster declarations from Kaggle.
- Data preparation and statistical processing are implemented in `process_data.py`.
- The pipeline uses:
  - feature selection from FEMA records
  - aggregation by state and incident type
  - historical probability estimation (IA/PA rates)
  - sparse-category filtering for statistical stability
  - export to `backend/data/fema_historical_insights.json` for RAG grounding
- This satisfies the requirement to use at least one dataset with appropriate data science methods.

### Original Work and Build Ownership

- Core idea, implementation, and integration are produced by team members during the hackathon.
- External mentor input is limited to guidance and feedback, not direct implementation handoff.

### AI Tool Citation

- AI tools used in this project:
  - Codex
  - Gemini
  - GPT5.2
- AI tools were used for coding assistance, prompt drafting, and documentation support.
- Final engineering decisions, validation, and integration were completed by the team.

### Presentation and Judging Acknowledgement

- The team will present the project for judging eligibility.
- The team acknowledges and accepts final judging outcomes.
