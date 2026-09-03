# AGENTS.md — td-web-portal

## Repo Boundary
You are working ONLY inside `/td-web-portal`.
Do NOT read or modify: td-backend, tallydekho-mobile-V4, td-source/desktop, td-website.

## First Steps (Every Session)
1. Read this file
2. Read BLUEPRINT.md
3. Read ROUTING_MAP.md
4. Read only the source files listed for your task

## Full Scan Rule
Full codebase scan is FORBIDDEN by default.
Only allowed when user explicitly says: **DO FULL CODEBASE REVIEW**

## Before Touching Code
- Read BLUEPRINT.md + TASK_ROUTING.md first
- Identify exact page/component/hook for the task
- Do not open unrelated pages

## Coding Rules
- Make the smallest production-safe patch
- Do not refactor unrelated code
- Do not rename files or change architecture
- Do not use mock data — always wire to live API
- src/data/*.js mock files exist but should not be used for display data
- All API calls go through `src/services/api.js`
- **Mobile API parity:** Web must use the same `/api/*` routes as `tallydekho-mobile-V4` for the same screen. Do not add web-only backend routes or duplicate aggregations when mobile already has an endpoint. Extra web UI panels should derive from existing mobile APIs (e.g. top customers from sales invoices, cost breakdown from `/api/expenses`).
- Data fetching: prefer page-local loaders / `api.*` from `src/services/api.js` (legacy `useApi` hook removed)
- State: AuthContext (token, user, companies, selectedCompany, selectedFY, isPaired)
- Do not expose secrets (.env, tokens)

## After Every Change
- Update CHANGELOG_AGENT.md
- Update API_USAGE.md if a new endpoint is called
- Update ROUTING_MAP.md if a new route is added

## Output Format
Return:
1. Files changed
2. What changed and why
3. How to test
4. Risks / follow-up
