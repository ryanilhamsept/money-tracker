# Money Tracker API

REST API backend for Money Tracker, built with Express.js.

## Quick Start

```bash
# 1. Copy env and fill in values
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Run dev server (with hot reload)
npm run dev

# Server starts on http://localhost:8080
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/transactions` | List all transactions |
| POST | `/api/transactions` | Create transaction |
| PUT | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |
| GET | `/api/accounts` | List all accounts |
| POST | `/api/accounts` | Create account |
| PUT | `/api/accounts/:id` | Update account fields |
| DELETE | `/api/accounts/:id` | Delete account |
| GET | `/api/budgets` | Get user budget |
| PUT | `/api/budgets` | Set/update budget |
| GET | `/api/goals` | List all goals |
| POST | `/api/goals` | Create goal |
| PUT | `/api/goals/:id` | Update goal |
| DELETE | `/api/goals/:id` | Delete goal |
| GET | `/api/installments` | List all installments |
| POST | `/api/installments` | Create installment |
| PUT | `/api/installments/:id` | Update installment |
| DELETE | `/api/installments/:id` | Delete installment |
| POST | `/api/ai/review` | Generate AI spending review |
| POST | `/api/ai/reply` | Reply to AI review |

Gmail-to-transaction auto-import runs separately as a Google Apps Script
(time-based trigger on the Gmail account, inserts via the Supabase REST API
directly) — not part of this backend.

## Auth

All endpoints (except `/api/health`) require a Supabase JWT:

```
Authorization: Bearer <supabase-jwt-token>
```

## Docker

```bash
docker build -t money-tracker-api .
docker run -p 8080:8080 --env-file .env money-tracker-api
```
