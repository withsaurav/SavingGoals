# Verdant — Salary Budgeting App (PRD)

## Original Problem Statement
"Build me a salary budgeting app."

## User Choices (defaults assumed)
- Features: income + expenses, 50/30/20 budget allocation, savings goals, charts, AI advisor
- Auth: JWT email/password (custom)
- AI: Claude Sonnet 4.5 via emergentintegrations (`EMERGENT_LLM_KEY`)
- Currency: USD default, multi-currency picker

## Architecture
- Backend: FastAPI + Motor (MongoDB). All routes under `/api`.
- Frontend: React 19 + React Router 7 + Shadcn UI + Recharts + Tailwind.
- Theme: "Organic & Earthy" (moss green / terracotta / ochre), Outfit + Manrope.

## Core Endpoints
- Auth: `/api/auth/{register,login,logout,me}`
- Budget: `/api/budget/settings` (GET, PUT)
- Transactions: `/api/transactions` (POST, GET, DELETE /{id})
- Goals: `/api/goals` (POST, GET, PUT /{id}, DELETE /{id})
- Dashboard: `/api/dashboard`
- AI: `/api/advisor/ask` (non-streaming), `/api/advisor/chat` (SSE)

## Implemented (2026-02)
- Email/password auth with bcrypt + JWT (Bearer + cookie). Admin seeded.
- Multi-currency, configurable salary + 50/30/20 (or custom) split with validation.
- Income/expense logging with bucket assignment; category presets; delete.
- Savings goals with progress, deadline, quick-contribute buttons.
- Dashboard: stat cards, 50/30/20 progress, bucket pie chart, category bar chart, recent activity.
- Sage AI advisor page using Claude Sonnet 4.5 with live snapshot context.
- 100% backend tests passed (19/19); UI flows verified.

## Backlog
- P1: Streaming Sage replies (SSE) in the UI.
- P1: Edit transaction (currently delete-only).
- P2: Recurring transactions (rent, subscriptions).
- P2: Export CSV / monthly report.
- P2: Multi-month trend charts.
- P3: Bill reminders / push notifications.
