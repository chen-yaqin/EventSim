# EventSim Architecture

## Overview
EventSim is split into two lightweight apps:

- `frontend` (React + Vite + React Flow)
- `backend` (Express, file-based cache, demo JSON store)

## Request Flow

1. User submits event on `/sim`.
2. Frontend calls `POST /api/plan`.
3. Backend returns compact graph JSON (root + worlds + roles).
4. Graph renders immediately.
5. On node click, frontend calls `POST /api/expand` for details.
6. Details are cached and reused.

## Caching

- Plan cache key: hash of `eventText + options + promptVersion`
- Expand cache key: hash of `eventHash + nodeId + promptVersion`
- Stored in `backend/cache/*.json`

## Guardrails

- Restricted categories blocked early in `/api/plan`
- App includes reflection-only disclaimer
- Expand endpoint includes basic in-memory rate limiting

## Data Contracts

`Node`:
- `id`
- `type` (`root | world | role`)
- `title`
- `delta`
- `one_liner`
- `tags`
- `confidence`
- `parentId`
- `worldId`
- `roleId`

`ExpandedDetails`:
- `nodeId`
- `consequences[3]`
- `why_it_changes`
- `next_question`
- `risk_flags[<=2]`
- `assumptions` (optional)
- `checklist` (optional)
