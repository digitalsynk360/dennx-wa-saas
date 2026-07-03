# Deenx AI

Multi-tenant WhatsApp Business platform — fully decoupled frontend
(Next.js 15 / TypeScript) and backend (FastAPI / Python 3.14),
PostgreSQL on Neon, Redis, Celery, LangChain.

**Current status: Phase 1–13 complete and working.**

**Total project scope: 14 phases.** Phase 14 (Deployment — Docker,
Nginx, SSL, CI/CD) is the only phase remaining; after that the
product is fully feature-complete *and* live-deployable. See "Phase
roadmap" below for the full breakdown.

---

## Stack & version decisions

| Layer | Choice | Notes |
|---|---|---|
| Backend language | Python 3.14 | see "Python 3.14 notes" below |
| Web framework | FastAPI 0.115.6 | Pydantic v2, async-native |
| ORM | SQLAlchemy 2.0.41 async | asyncpg driver |
| Migrations | Alembic 1.14.0 | reads `DATABASE_URL_SYNC`, autogenerate |
| Database | PostgreSQL (Neon Cloud) + pgvector | AI knowledge base |
| Cache / broker | Redis 5.2.1 | cache, rate limits, WebSocket pub/sub, Celery |
| Background jobs | Celery 5.4.0 | queues: default / webhooks / campaigns / ai |
| AI | LangChain 0.3.13 | OpenAI + Anthropic providers |
| Frontend | Next.js 15.1.3 / React 19 | App Router |
| Language | TypeScript 5.7.2 | strict mode |
| Styling | Tailwind CSS 3.4.17 + Shadcn/UI | design tokens from reference UI |
| Forms | React Hook Form 7.54.2 + Zod 3.24.1 | |
| HTTP client | Axios 1.7.9 | auto-refresh on 401 |
| Date utils | date-fns 4.1.0 | inbox timestamps |
| Flow canvas | React Flow 11.11.4 | drag-drop visual flow editor |
| Charts | Recharts 2.15.0 | Analytics dashboard |

### Python 3.14 notes

Three packages need newer versions for prebuilt cp314 wheels (no
Rust/C++ toolchain required):

| Package | Why bumped |
|---|---|
| `asyncpg` 0.30 → **0.31.0** | first release with cp314 Windows wheel |
| `orjson` 3.10 → **3.11.9** | first release with cp314 Windows wheel |
| `pydantic` 2.10 → **2.12.5** | pulls pydantic-core ≥ 2.47 which has cp314 wheels |
| `psycopg2-binary` → **`psycopg[binary]==3.3.4`** | psycopg2 has no 3.14 wheel; psycopg3 is the successor |

Because of the psycopg3 switch, `DATABASE_URL_SYNC` uses the
`postgresql+psycopg://` driver prefix (not `postgresql+psycopg2://`).
See `.env.example` for the full connection string format.

---

## Project layout

```
limbu-wa-saas/
├── .env.example                  all env vars documented
├── README.md                     this file
├── SETUP-GUIDE-HINDI.md          step-by-step Hindi setup guide
├── backend/
│   ├── requirements.txt          pinned deps (Python 3.14 compatible)
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py                reads DATABASE_URL_SYNC, creates pgvector ext
│   │   └── versions/             generated migration files
│   └── app/
│       ├── main.py               FastAPI app, CORS, lifespan, RBAC seed
│       ├── core/
│       │   ├── config.py         pydantic-settings — single source of truth
│       │   ├── database.py       async engine (Neon-tuned)
│       │   ├── redis.py          shared async Redis pool
│       │   ├── celery_app.py     4 queues + beat schedule
│       │   ├── encryption.py     Fernet field encryption (tenant tokens)
│       │   ├── security.py       bcrypt + JWT (access + refresh)
│       │   ├── rate_limit.py     Redis fixed-window limiter
│       │   └── logging.py        structlog JSON
│       ├── models/               28-table PostgreSQL schema
│       │   ├── base.py           UUIDMixin, TimestampMixin, TenantMixin
│       │   ├── identity.py       users, workspaces, members, roles, permissions
│       │   ├── whatsapp.py       whatsapp_accounts
│       │   ├── contact.py        contacts, tags, contact_tags
│       │   ├── messaging.py      conversations, messages
│       │   ├── template.py       templates
│       │   ├── campaign.py       campaigns, campaign_recipients
│       │   ├── automation.py     chatbot_rules, chatbot_flows, flow_sessions, automations
│       │   ├── crm.py            crm_leads, crm_tasks, tickets
│       │   ├── billing.py        subscriptions, invoices
│       │   ├── platform.py       audit_logs, outbound_webhooks, knowledge_documents
│       │   └── api_key.py        api_keys — Phase 13
│       ├── schemas/              Pydantic request/response models
│       │   ├── auth.py
│       │   ├── workspace.py
│       │   ├── whatsapp.py
│       │   ├── conversation.py
│       │   ├── contact_schema.py
│       │   ├── campaign.py             Phase 7
│       │   ├── template.py              Phase 8
│       │   ├── chatbot.py               Phase 9 + 10 (rules + flows)
│       │   ├── ai.py                    Phase 11
│       │   ├── analytics.py             Phase 12
│       │   ├── billing.py               Phase 13
│       │   ├── api_key.py               Phase 13
│       │   └── notification.py          Phase 13
│       ├── repositories/         workspace-scoped data access (Repository Pattern)
│       │   ├── base.py
│       │   ├── user_repository.py
│       │   ├── workspace_repository.py
│       │   ├── whatsapp_repository.py
│       │   ├── conversation_repository.py
│       │   ├── contact_repository.py
│       │   ├── campaign_repository.py        Phase 7
│       │   ├── template_repository.py        Phase 8
│       │   ├── chatbot_repository.py         Phase 9 + 10
│       │   ├── knowledge_repository.py       Phase 11 — pgvector search
│       │   ├── billing_repository.py         Phase 13
│       │   └── api_key_repository.py         Phase 13
│       ├── services/             business logic / use cases (Clean Architecture)
│       │   ├── auth_service.py
│       │   ├── email_service.py
│       │   ├── workspace_service.py           also list_agents() — Phase 13
│       │   ├── whatsapp_service.py
│       │   ├── conversation_service.py
│       │   ├── webhook_service.py             also triggers chatbot/flow replies
│       │   ├── contact_service.py
│       │   ├── campaign_dispatcher.py         Phase 7 — broadcast send engine
│       │   ├── template_service.py            Phase 8 — Meta submit/sync
│       │   ├── chatbot_service.py             Phase 9 — keyword matching engine
│       │   ├── flow_service.py                Phase 10 — flow CRUD
│       │   ├── flow_engine.py                 Phase 10 — node graph execution
│       │   ├── ai_service.py                  Phase 11 — embeddings, RAG, suggest/summarize
│       │   ├── analytics_service.py           Phase 12 — dashboard aggregation queries
│       │   ├── billing_service.py             Phase 13 — plan/quota/usage
│       │   ├── api_key_service.py             Phase 13 — key generation/hashing
│       │   └── notification_service.py        Phase 13 — preferences in Workspace.settings
│       ├── api/v1/
│       │   ├── router.py         mounts all feature routers
│       │   ├── dependencies/
│       │   │   ├── auth.py       get_current_user from JWT
│       │   │   └── workspace.py  get_workspace_context, require_permission
│       │   └── endpoints/
│       │       ├── auth.py
│       │       ├── workspaces.py
│       │       ├── whatsapp.py
│       │       ├── conversations.py
│       │       ├── contacts.py
│       │       ├── campaigns.py             Phase 7
│       │       ├── templates.py             Phase 8
│       │       ├── chatbot.py               Phase 9
│       │       ├── flows.py                 Phase 10
│       │       ├── ai.py                    Phase 11
│       │       ├── analytics.py             Phase 12
│       │       ├── billing.py               Phase 13
│       │       ├── api_keys.py               Phase 13
│       │       ├── notifications.py          Phase 13
│       │       └── agents.py                 Phase 13
│       ├── websocket/manager.py  Redis pub/sub fan-out (multi-worker safe)
│       ├── workers/tasks.py      Celery task surface + beat jobs
│       └── utils/
│           ├── rbac_seed.py      Admin/Manager/Agent roles seeded on startup
│           └── slug.py
└── frontend/
    ├── package.json              date-fns, axios, react-hook-form, zod etc.
    ├── tailwind.config.ts        design tokens from reference screenshots
    └── src/
        ├── app/
        │   ├── layout.tsx              root layout (AuthProvider)
        │   ├── page.tsx                landing page
        │   ├── login/page.tsx
        │   ├── signup/page.tsx
        │   ├── forgot-password/page.tsx
        │   ├── reset-password/page.tsx
        │   ├── verify-email/page.tsx
        │   └── (dashboard)/            authenticated shell (sidebar + topbar)
        │       ├── layout.tsx          route-group layout with auth guard
        │       ├── dashboard/page.tsx
        │       ├── inbox/page.tsx      real-time WhatsApp chat
        │       ├── history/page.tsx    resolved conversations
        │       ├── contacts/page.tsx   contacts table, CSV import/export
        │       ├── campaigns/page.tsx  Phase 7 — broadcast campaigns
        │       ├── templates/page.tsx  Phase 8 — Meta template management
        │       ├── chatbot/page.tsx    Phase 9 — keyword auto-reply rules
        │       ├── flows/page.tsx      Phase 10 — flow list
        │       ├── flows/[id]/page.tsx Phase 10 — visual flow editor (React Flow)
        │       ├── settings/page.tsx   WhatsApp connect + webhook URL
        │       └── sub-admins/page.tsx invite / manage team members
        ├── components/
        │   ├── auth/auth-layout.tsx    teal card layout for auth pages
        │   ├── layout/
        │   │   ├── sidebar.tsx         nav rail (permission-filtered)
        │   │   ├── sidebar-nav.ts      nav item config
        │   │   └── topbar.tsx          workspace switcher + role badge
        │   └── ui/                     Button, Input, Label, Card, Alert,
        │                               Dialog, Select (Shadcn/UI style)
        ├── context/auth-context.tsx    login/signup/logout, /auth/me, workspace switching
        ├── hooks/
        │   ├── use-require-auth.ts     route guard
        │   └── inbox/use-inbox-ws.ts  WebSocket with auto-reconnect
        ├── lib/
        │   ├── api.ts                  Axios + JWT interceptor + silent refresh
        │   ├── auth-storage.ts         localStorage: tokens + active workspace
        │   ├── permissions.ts          client-side RBAC (mirrors seed)
        │   ├── utils.ts                cn() class merge
        │   └── validation.ts           Zod schemas for all forms
        └── types/
            ├── auth.ts
            ├── workspace.ts
            ├── inbox.ts
            ├── contacts.ts
            └── whatsapp.ts
```

---

## Database schema (28 tables)

| Module file | Tables |
|---|---|
| `identity.py` | `users`, `workspaces`, `workspace_members`, `roles`, `permissions`, `role_permissions` |
| `whatsapp.py` | `whatsapp_accounts` — encrypted token, quality rating, status |
| `contact.py` | `contacts`, `tags`, `contact_tags` |
| `messaging.py` | `conversations`, `messages` — 24h session window, bot/requested/intervened |
| `template.py` | `templates` — Meta sync + approval lifecycle |
| `campaign.py` | `campaigns`, `campaign_recipients` — denormalized counters |
| `automation.py` | `chatbot_rules`, `chatbot_flows`, `flow_sessions`, `automations` |
| `crm.py` | `crm_leads`, `crm_tasks`, `tickets` |
| `billing.py` | `subscriptions`, `invoices` |
| `platform.py` | `audit_logs`, `outbound_webhooks`, `knowledge_documents` (pgvector, used by Phase 11 AI) |
| `api_key.py` | `api_keys` — Phase 13, bcrypt-hashed developer API keys |

---

## API endpoints (40 routes)

### Auth — `/api/v1/auth`
| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Create user + first workspace |
| POST | `/auth/login` | Returns token pair |
| POST | `/auth/refresh` | Rotate access token |
| POST | `/auth/logout` | Client-side token discard |
| GET | `/auth/me` | Current user + workspaces |
| POST | `/auth/verify-email` | Consume email verification token |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Set new password |
| POST | `/auth/change-password` | Change password (logged in) |

### Workspaces — `/api/v1/workspaces`
| Method | Path | Description |
|---|---|---|
| GET | `/workspaces` | My workspaces |
| GET | `/workspaces/roles` | Available roles |
| GET/PATCH | `/workspaces/current` | Active workspace details/update |
| GET/POST | `/workspaces/current/members` | List / invite Sub Admin |
| PATCH/DELETE | `/workspaces/current/members/{id}` | Change role / remove |

### WhatsApp — `/api/v1`
| Method | Path | Description |
|---|---|---|
| POST | `/whatsapp/connect` | Connect with credentials |
| DELETE | `/whatsapp/disconnect` | Disconnect |
| GET | `/whatsapp/account` | Connected account info |
| GET | `/webhooks/whatsapp` | Meta webhook verification |
| POST | `/webhooks/whatsapp` | Inbound messages from Meta |

### Conversations — `/api/v1/conversations`
| Method | Path | Description |
|---|---|---|
| GET | `/conversations` | Open inbox (with handling filter) |
| GET | `/conversations/history` | Resolved conversations |
| GET | `/conversations/{id}` | Single conversation |
| GET | `/conversations/{id}/messages` | Messages (paginated) |
| POST | `/conversations/{id}/messages` | Send outbound message |
| PATCH | `/conversations/{id}` | Resolve / intervene / assign |
| WS | `/ws/{workspace_id}` | Real-time inbox updates |

### Contacts — `/api/v1`
| Method | Path | Description |
|---|---|---|
| GET | `/contacts` | List with search / status filter / pagination |
| POST | `/contacts` | Create contact |
| GET | `/contacts/export` | Download contacts CSV |
| POST | `/contacts/import` | Upload CSV (bulk import) |
| GET/PATCH/DELETE | `/contacts/{id}` | Get / update / delete |
| POST | `/contacts/{id}/tags` | Add tags to contact |
| GET/POST | `/tags` | List / create workspace tags |

### Campaigns — `/api/v1/campaigns` (Phase 7)
| Method | Path | Description |
|---|---|---|
| GET | `/campaigns` | List campaigns (paginated) |
| POST | `/campaigns` | Create campaign (selects contacts by ID and/or tag) |
| GET | `/campaigns/{id}` | Detail with per-recipient status |
| POST | `/campaigns/{id}/launch` | Start sending now (also resumes a paused campaign) |
| POST | `/campaigns/{id}/pause` | Pause a running campaign |
| POST | `/campaigns/{id}/cancel` | Cancel a campaign |

### Templates — `/api/v1/templates` (Phase 8)
| Method | Path | Description |
|---|---|---|
| GET | `/templates` | List local templates |
| POST | `/templates` | Create a draft template |
| POST | `/templates/{id}/submit` | Submit to Meta for approval |
| POST | `/templates/sync` | Pull latest statuses from Meta |
| DELETE | `/templates/{id}` | Delete a template |

### Chatbot Rules — `/api/v1/chatbot` (Phase 9)
| Method | Path | Description |
|---|---|---|
| GET | `/chatbot/rules` | List rules in priority order |
| POST | `/chatbot/rules` | Create a keyword-matched rule |
| PATCH | `/chatbot/rules/{id}` | Update a rule (or toggle active) |
| DELETE | `/chatbot/rules/{id}` | Delete a rule |
| POST | `/chatbot/rules/reorder` | Drag-and-drop priority reorder |

### Flow Builder — `/api/v1/flows` (Phase 10)
| Method | Path | Description |
|---|---|---|
| GET | `/flows` | List flows |
| POST | `/flows` | Create a new (empty) flow |
| GET | `/flows/{id}` | Get flow with full node/edge graph |
| PUT | `/flows/{id}/graph` | Save the node/edge graph (Save button) |
| POST | `/flows/{id}/activate` | Turn the flow on |
| POST | `/flows/{id}/deactivate` | Turn the flow off |
| DELETE | `/flows/{id}` | Delete a flow |

### AI — `/api/v1/ai` (Phase 11)
| Method | Path | Description |
|---|---|---|
| GET | `/ai/knowledge` | List knowledge base documents |
| POST | `/ai/knowledge` | Add a document (auto-embedded via OpenAI) |
| DELETE | `/ai/knowledge/{id}` | Delete a document |
| POST | `/ai/suggest-reply` | Get an AI-suggested reply for a conversation (RAG) |
| GET | `/ai/conversations/{id}/summary` | AI summary + sentiment + key points |
| POST | `/ai/ask` | Ask the in-app assistant a question (RAG over knowledge base) |

### Analytics — `/api/v1/analytics` (Phase 12)
| Method | Path | Description |
|---|---|---|
| GET | `/analytics/overview?period_days=N` | Metrics, daily message chart, campaign performance |

### Billing — `/api/v1/billing` (Phase 13)
| Method | Path | Description |
|---|---|---|
| GET | `/billing/subscription` | Current plan, period, seats |
| POST | `/billing/change-plan` | Switch plan (self-serve, no payment gateway wired yet) |
| GET | `/billing/invoices` | Invoice history |
| GET | `/billing/usage` | Messages/seats used vs quota |

### API Keys — `/api/v1/api-keys` (Phase 13)
| Method | Path | Description |
|---|---|---|
| GET | `/api-keys` | List keys (prefix only, never the full secret) |
| POST | `/api-keys` | Create a key (full secret returned once) |
| DELETE | `/api-keys/{id}` | Revoke a key |

### Notifications — `/api/v1/notifications` (Phase 13)
| Method | Path | Description |
|---|---|---|
| GET | `/notifications/preferences` | Current notification toggles |
| PATCH | `/notifications/preferences` | Update one or more toggles |

### Agents — `/api/v1/agents` (Phase 13)
| Method | Path | Description |
|---|---|---|
| GET | `/agents` | Team members with online status + assigned open chats |

---

## Local setup

### Prerequisites
- Python 3.14 (python.org)
- Node.js 20 LTS (nodejs.org)
- Redis running on localhost:6379 (or Upstash cloud)
- Neon PostgreSQL account (neon.tech — free tier)

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux

python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# Copy and fill env file
copy ..\env.example .env         # Windows
# cp ../.env.example .env        # Mac/Linux
# Fill: DATABASE_URL, DATABASE_URL_SYNC, JWT_SECRET_KEY,
#       JWT_REFRESH_SECRET_KEY, FIELD_ENCRYPTION_KEY, REDIS_URL

# Run migrations (first time only)
alembic revision --autogenerate -m "initial schema"
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

Verify at: `http://localhost:8000/api/health`
API docs at: `http://localhost:8000/api/docs`

### Frontend

```powershell
cd frontend
npm install

# Create env file
echo NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 > .env.local
echo NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws >> .env.local

npm run dev
```

Open: `http://localhost:3000`

### Background workers (needed for campaigns, AI tasks)

```powershell
cd backend
.venv\Scripts\activate
celery -A app.core.celery_app worker -l info -Q default,webhooks,campaigns,ai
# In a separate terminal:
celery -A app.core.celery_app beat -l info
```

---

## Environment variables

All variables are documented in `.env.example`. Summary:

| Variable | When needed | How to get |
|---|---|---|
| `DATABASE_URL` | Now | Neon → Connection Details (pooled) — change `postgresql://` to `postgresql+asyncpg://` and use `ssl=require` |
| `DATABASE_URL_SYNC` | Now | Same but `postgresql+psycopg://` and keep `sslmode=require` |
| `JWT_SECRET_KEY` | Now | `python -c "import secrets; print(secrets.token_hex(64))"` |
| `JWT_REFRESH_SECRET_KEY` | Now | Same command, different value |
| `FIELD_ENCRYPTION_KEY` | Now | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `REDIS_URL` | Now | `redis://localhost:6379/0` or Upstash URL |
| `META_APP_SECRET` | Phase 5 | Meta App Dashboard → App Settings → Basic |
| `META_VERIFY_TOKEN` | Phase 5 | Any random string — paste same in Meta webhook config |
| `SMTP_*` + `FROM_EMAIL` | Phase 2 (password reset emails) | Your SMTP provider |
| `OPENAI_API_KEY` | Phase 11 (AI — embeddings, suggest reply, summaries) | platform.openai.com |
| `CAMPAIGN_SEND_RATE_PER_SECOND` | Phase 7 (optional, defaults to 1) | Set based on your number's Meta throughput tier |

Frontend only needs (in `frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws
```

---

## Phase roadmap

| Phase | Status | What was built |
|---|---|---|
| 1 | ✅ Done | Architecture, 27-table schema, backend/frontend scaffold, Docker config |
| 2 | ✅ Done | JWT auth, signup/login/logout, email verify, password reset, auth pages |
| 3 | ✅ Done | Workspaces, RBAC (Admin/Manager/Agent), Sub Admins, sidebar + topbar shell |
| 4 | ✅ Done | Inbox (real-time WebSocket chat), History page, message send/receive, resolve/intervene |
| 5 | ✅ Done | WhatsApp Cloud API connect (manual credentials), Meta webhook verify + receive, inbound message processing |
| 6 | ✅ Done | Contacts CRUD, CSV import/export, tags, search/filter/pagination |
| 7 | ✅ Done | Campaigns (broadcast, contact/tag targeting, launch/pause/cancel, per-recipient tracking) |
| 8 | ✅ Done | Templates (create draft, submit to Meta, sync status, approval lifecycle) |
| 9 | ✅ Done | Chatbot keyword rules (priority-ordered matching engine, auto-reply on inbound messages) |
| 10 | ✅ Done | Flow Builder (visual drag-drop canvas, 14 node types, execution engine with session persistence) |
| 11 | ✅ Done | AI (OpenAI embeddings + RAG knowledge base, Suggest Reply, conversation summary/sentiment, in-app assistant) |
| 12 | ✅ Done | Analytics dashboard (conversation/contact/message metrics, daily message chart, campaign performance) |
| 13 | ✅ Done | Full Settings (Notifications, API Keys, Billing & Usage, Agents) |
| 14 | 🔜 Next | Deployment (Docker, Nginx, SSL, CI/CD) |

---

## Phase 5 — WhatsApp setup (important)

Phase 5 uses **Meta WhatsApp Cloud API with manual credentials**.
The customer fills in credentials once in Settings → the backend
encrypts and stores them.

**Steps:**
1. Go to `http://localhost:3000/settings`
2. Fill in: Phone Number ID, WABA ID, Display Phone Number,
   Business Name, Permanent Access Token
3. Click "Save Settings" — the account status turns LIVE
4. Configure the webhook in Meta App Dashboard:
   - URL: `http://your-domain/api/v1/webhooks/whatsapp`
   - Verify Token: same value as `META_VERIFY_TOKEN` in `.env`
   - For local testing, use ngrok:
     ```
     ngrok http 8000
     # Use: https://xxxx.ngrok.io/api/v1/webhooks/whatsapp
     ```
5. Subscribe to: `messages`, `message_deliveries`, `message_reads`

---

## Phase 7 — Campaigns (how it works)

1. Create an **approved** template first (Phase 8) — campaigns can
   only use templates Meta has approved, since the 24-hour free-form
   messaging window doesn't apply for cold outreach.
2. `localhost:3000/campaigns` → "New Campaign" → pick the template,
   select contacts (checkbox list) → Create.
3. Campaign starts in `draft`. Click **Launch** to start sending —
   status moves to `running`, recipients are sent at a configurable
   rate (`CAMPAIGN_SEND_RATE_PER_SECOND` in `.env`, default 1/sec to
   respect Meta's per-number throughput tiers).
4. **Pause** / **Resume**: the dispatcher re-checks campaign status
   before sending to each recipient, so pausing mid-run is immediate.
5. Counters (`sent_count`, `failed_count`, etc.) update live on the
   campaign row as messages go out.

**Known limitation:** campaign-sent messages are tracked only via the
recipient row (status/error), not inserted into the unified `messages`
table — they're not tied to a live Conversation in this phase. A
future phase can attach/create a conversation per recipient if a
unified message history view is needed.

## Phase 8 — Templates (how it works)

1. `localhost:3000/templates` → "New Template" → fill name (lowercase
   + underscores), category (Marketing/Utility/Authentication), body
   text with `{{1}}`, `{{2}}` placeholders for variables, optional
   footer.
2. Saved as a local `draft`/`pending` template. Click **Submit** to
   push it to Meta's `/message_templates` endpoint for review.
3. Meta's review usually takes minutes to ~24 hours. Click **Sync
   from Meta** any time to pull the latest approval status
   (approved/pending/rejected/paused) for every template.
4. Only `approved` templates appear in the Campaign creation dropdown.

## Phase 9 — Chatbot Rules (how it works)

1. `localhost:3000/chatbot` → "Add Rule" → name, comma-separated
   keywords, match type (contains/exact/starts_with/regex), reply text.
2. When any text message arrives via the webhook, rules are checked
   in **priority order** (highest first) — the first match sends its
   `reply_text` automatically and stops checking further rules.
3. Toggle a rule's switch to activate/deactivate without deleting it.
4. A rule can also point at a Flow (`flow_id`) instead of a plain
   reply — in that case Phase 10's flow engine takes over the
   conversation.

## Phase 10 — Flow Builder (how it works)

1. `localhost:3000/flows` → "New Flow" → opens the visual editor.
2. Drag node types from the left palette onto the canvas: Message,
   Text & Buttons, List Menu, Dynamic List, Multi Product, Condition,
   Wait/Delay, Save Reply, API Call, Update Contact, Template,
   Transfer, Connect Flow, End.
3. Click a node to configure its content in the right panel. Connect
   nodes by dragging from one node's edge to another's.
4. Click **Save** to persist the graph (`PUT /flows/{id}/graph`).
5. Toggle the flow **Active** on the Flows list page.
6. Link a Chatbot Rule's `flow_id` to this flow (or set `trigger_type`
   to `welcome` for first-contact flows) to make it live.
7. **Execution engine** (`flow_engine.py`): walks the saved graph
   per-contact, persisting progress in a `FlowSession` row so a
   flow survives server restarts. `Message`/`Condition`/`End` nodes
   auto-advance; `Text & Buttons`/`List Menu`/`Save Reply` nodes pause
   and wait for the contact's next message before continuing.
   `Condition` branches by comparing a saved variable to an expected
   value along edges labeled `true`/`false`.
8. **Not yet implemented:** Dynamic List, Multi Product, API Call,
   Update Contact, Delay, Template, Transfer, and Connect Flow nodes
   are recognized but currently pass straight through to the next
   node (no-op) — they depend on subsystems not yet built (Catalogue,
   CRM field updates, real delay scheduling, cross-flow handoff).
   This is a documented extension point for a later phase.

---

## Phase 11 — AI (how it works)

1. Set `OPENAI_API_KEY` in `backend/.env` (the rest of the app works
   fine without it — AI endpoints return a clear 503 if missing).
2. `localhost:3000/settings` → **AI Knowledge Base** tab → "Add
   Document" → paste business info, FAQs, policies, pricing, etc.
   Each document is embedded (`text-embedding-3-small`, 1536 dims)
   and stored in `knowledge_documents` (pgvector).
3. `localhost:3000/inbox` → open any conversation with at least one
   inbound message → click the **sparkle (✨) button** next to the
   message box → an AI-drafted reply is generated using the most
   relevant knowledge base chunks (cosine similarity search) plus the
   last 10 messages of context. Edit before sending — it's a draft,
   not auto-sent.
4. Conversation summaries and sentiment classification are available
   via `GET /ai/conversations/{id}/summary` (not yet wired to a UI
   button in this phase — a natural follow-up for the Inbox right
   panel).
5. `POST /ai/ask` powers a general-purpose "ask your own data"
   assistant — answers strictly from the knowledge base, says so
   honestly when it doesn't know.

## Phase 12 — Analytics (how it works)

1. `localhost:3000/analytics` → pick a period (7/30/90 days)
2. Top metric cards: total/open/resolved conversations, contacts
   (with new-this-period delta), messages sent/received, average
   first-response time (computed from the gap between the first
   inbound and first outbound message per conversation).
3. Bar chart: daily sent vs received message volume for the period.
4. Campaign performance table: delivery rate and read rate per
   campaign (computed from the `Campaign` counters Phase 7 updates
   live during a send).

**Known limitation:** "Top chatbot rules" (which rules fire most
often) is a placeholder returning an empty list — there's no
dedicated `rule_triggers` table yet to count firings without scanning
every webhook event. A future phase can add lightweight trigger
logging to `chatbot_service.match_message()` to populate this.

## Phase 13 — Full Settings (how it works)

**Notifications** (`Settings → Notifications`): five toggles
(new message email, campaign complete, template status, weekly
summary, push). Stored inside `Workspace.settings` JSONB under a
`notifications` key — no new table needed, consistent with how
`settings` already holds other workspace-level config.

**API Keys** (`Settings → API Keys`): create a key, copy the full
secret immediately (`lwa_live_...`) — it is never shown again, only
a bcrypt hash and an 8-character display prefix are stored. Revoke
any key instantly from the list.

**Billing & Usage** (`localhost:3000/billing`): shows the current
plan, a usage bar (messages sent this period vs quota), and seat
count. Switching plans is self-serve in this phase (updates the local
`Subscription` row directly) — no payment gateway (Stripe/Razorpay)
is wired yet, so this is plan *selection*, not plan *payment*. Wiring
a real gateway is a clear extension point for a later phase.

**Agents** (`localhost:3000/agents`): reuses the same `WorkspaceMember`
data as Sub Admins (Phase 3), reshaped to show live online/offline
status and a count of currently-open conversations assigned to each
person — useful for spotting an overloaded agent at a glance.

---

## Common issues & fixes

| Error | Fix |
|---|---|
| `psycopg2-binary` build error | Use `psycopg[binary]==3.3.4` in requirements.txt (already done) |
| `asyncpg` / `orjson` / `pydantic-core` build error | Use versions in requirements.txt — they have cp314 wheels |
| CORS error in browser | Ensure `FRONTEND_URL=http://localhost:3000` in `backend/.env` and backend is running |
| `TokenPairResponse` positional arg error | Fixed — use keyword args: `TokenPairResponse(access_token=..., refresh_token=...)` |
| `MissingGreenlet` on Sub Admin create | Fixed — use `selectinload` for user + role in `invite_member` |
| Redis connection refused | Start Redis: `redis-server` or use Upstash |
| `alembic` error: `DATABASE_URL_SYNC is not set` | Fill `backend/.env` with `DATABASE_URL_SYNC=postgresql+psycopg://...` |
| Campaign "Launch" does nothing visible | It dispatches in the background (`asyncio.create_task`) — refresh the campaigns list after a few seconds to see counters update |
| Template "Submit" fails with Meta error | WhatsApp account must be connected (Settings) and the WABA must have template-creation permission; check the exact Meta error message returned |
| Chatbot rule doesn't trigger | Rule must be `is_active=true`; check `match_type` and exact keyword spelling; rules with higher `priority` are checked first |
| Flow doesn't respond to contact replies | The Flow must be `is_active=true` and either set as `welcome` trigger or linked via a Chatbot Rule's `flow_id` |
| `npm run dev` fails after Phase 7-10 update with reactflow error | Run `npm install` again — `reactflow` was added to `package.json` |
| AI features return 503 | Set `OPENAI_API_KEY` in `backend/.env` — every other phase works without it |
| Analytics page shows no data | Needs at least one conversation/message in the selected period; try a wider period (90 days) |
| `npm run build` fails with recharts error | Run `npm install` again — `recharts` was added to `package.json` in Phase 12 |
| API key only shown once, lost it | This is by design (like Stripe/GitHub tokens) — revoke it and create a new one |
| Billing "Switch" plan does nothing visible beyond the badge | Expected in this phase — no payment gateway is wired, it's local plan selection only |
