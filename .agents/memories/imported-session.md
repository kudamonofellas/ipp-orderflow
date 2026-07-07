# Session: IPP-OrderFlow context import (2026-07-06)

Source: https://opncd.ai/share/8SxuLQHw (OpenCode session, GLM-5.2 then gpt-5.2-codex)

## What was imported
Full conversation transcript from the original IPP-OrderFlow prototype exploration session. Captured into `project-context.md` (same folder).

## Conversation turns (5 user messages)
1. "hi" → greeting
2. "learn about this project..." + roles/permissions table (Owner/Admin-Sales/Finance/Warehouse/Production/Delivery) → assistant explored prototype codebase, summarized flow + tech stack
3. Shared VPS docker-compose.yml (Traefik, Hermes, n8n+PG, Evolution API+PG+Redis, business PG horeca_orders, Directus prod+dev) → assistant mapped their stack to prototype's go-live needs
4. Shared Directus schema snapshot (minimal: attachments, messages, orders collections) → assistant analyzed
5. "we don't need hermes at this moment" + asked about opencode session persistence across Antigravity↔VS Code → answered (sessions persist locally, use `/sessions` or `opencode -c`)
6. (later, model switched to gpt-5.2-codex/gpt-5.2) Shared dashboard screenshots — original vs their redesign (top bar nav + WhatsApp Intake panel) → assistant gave UI feedback

## Key decisions captured
- New project rebuilds IPP-OrderFlow flow/UI on the user's existing Directus+n8n+Evolution+Postgres+Traefik stack (drops Firebase plan)
- Hermes on hold
- No code written yet — context-gathering phase only
- Dashboard redesign in progress (top bar nav + WhatsApp Intake)

## State of THIS workspace
`d:\Ranto\AI Agents\IPP\IPP-OrderFlow\IPP-OrderFlow` contains the new project scaffold (React + Vite + TS, package.json, src/, public/, .agents/). The original prototype codebase is in a different location and was read during the imported session.

## Next
Await user direction: likely either (a) share fuller schema and design the Directus collections + frontend rewrite plan, or (b) continue dashboard UI iteration.
