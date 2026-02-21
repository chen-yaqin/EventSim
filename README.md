# EventSim

EventSim is a hackathon-ready event-level simulator that combines:

- Counterfactual branching (minimal, moderate, radical worlds)
- Role-based perspective switching (`you_now`, `you_5y`, `neutral_advisor`)
- Compact node insights with lazy expansion and cache-first API design

## Quick Start

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:8787`.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Features in this scaffold

- Scenario input + templates
- Simulation graph skeleton (root + 3 worlds + 3 roles each)
- Lazy node expansion (`POST /api/expand`) with file cache
- Compare drawer
- Demo mode + pre-generated scenarios (`/demo`)
- JSON export and summary copy
- Safety guardrails for restricted categories

## Project Structure

```text
EventSim/
  frontend/
  backend/
  docs/
  assets/
```

See `docs/ARCHITECTURE.md` and `docs/DEMO.md` for implementation details and demo flow.
An interactive event-level simulator combining counterfactual reasoning and role-based perspectives.
