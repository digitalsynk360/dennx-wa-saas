# Deenx AI — Shuru se Deployment tak (Step by Step Guide)

**Phase 1-13 complete hai:** Authentication, Workspaces, Sub Admins,
Inbox (real-time chat), WhatsApp Connect, Contacts, Campaigns,
Templates, Chatbot Rules, Flow Builder, AI Assistant, Analytics,
Billing/API Keys/Notifications/Agents — sab working.

**Total phases: 14.** Sirf **Phase 14 (Deployment — Docker, Nginx,
SSL, live server)** baaki hai. Uske baad product fully ready hoga
live customers ke liye.

---

## STEP 1: Zip download karo aur extract karo

1. `limbu-wa-saas-final-phase1-6.zip` download karo
2. Computer par folder banao, e.g. `C:\Projects\limbu-wa-saas`
3. Zip extract karo usi folder me
4. VS Code kholo → `File > Open Folder` → extracted folder select karo

Folder structure aisa dikhna chahiye:
```
limbu-wa-saas/
├── .env.example
├── README.md
├── SETUP-GUIDE-HINDI.md   ← yahi file
├── backend/
└── frontend/
```

---

## STEP 2: Zaroori software install karo (ek baar)

Agar already installed hai to skip karo.

### 1. Python 3.14
- https://www.python.org/downloads/ jao
- "Windows installer (64-bit)" download karo
- Install karte waqt **"Add Python to PATH" checkbox ON** rakho

### 2. Node.js 20 LTS
- https://nodejs.org/ se download karo

### 3. Redis (local development ke liye)
- Windows: https://github.com/tporadowski/redis/releases se download karo
- Ya phir **Upstash** (free cloud Redis): https://upstash.com

### 4. Neon PostgreSQL (free cloud database)
- https://neon.tech → account banao
- New project banao
- "Connection Details" me jao → "Pooled connection" string copy karo
- Ye string tumhe `backend/.env` me chahiye

---

## STEP 3: Backend `.env` file banao

`backend/` folder me `.env` naam ki file banao.
`.env.example` ko copy karke rename karo ya naya banao.

**Ye 5 values ZAROORI hain (baki baad me):**

### DATABASE_URL (asyncpg — FastAPI ke liye)
Neon connection string me sirf ye changes karo:
- `postgresql://` → `postgresql+asyncpg://`
- `sslmode=require&channel_binding=require` → `ssl=require`

```
DATABASE_URL=postgresql+asyncpg://neondb_owner:PASSWORD@HOST/neondb?ssl=require
```

### DATABASE_URL_SYNC (psycopg3 — Alembic ke liye)
Same Neon string, sirf prefix change karo:
- `postgresql://` → `postgresql+psycopg://`
- Baaki params same rakh sakte ho

```
DATABASE_URL_SYNC=postgresql+psycopg://neondb_owner:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require
```

### JWT_SECRET_KEY aur JWT_REFRESH_SECRET_KEY
PowerShell me ye command chalao (do baar, alag-alag values):
```powershell
python -c "import secrets; print(secrets.token_hex(64))"
```

### FIELD_ENCRYPTION_KEY
```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### REDIS_URL
```
REDIS_URL=redis://localhost:6379/0
```
(Upstash use karo to unka URL dalte hain)

### FRONTEND_URL (CORS ke liye)
```
FRONTEND_URL=http://localhost:3000
```

### OPENAI_API_KEY (optional — sirf Phase 11 AI features ke liye)
Agar abhi AI features (Suggested Reply, Knowledge Base) use nahi
karne, to is line ko khali ya skip kar sakte ho — baaki sab phases
(1-10, 12, 13) bina iske bhi fully kaam karte hain.
```
OPENAI_API_KEY=
```

**Poori `.env` file kuch aisi dikhni chahiye:**
```
DATABASE_URL=postgresql+asyncpg://neondb_owner:xxxxx@ep-xxx.neon.tech/neondb?ssl=require
DATABASE_URL_SYNC=postgresql+psycopg://neondb_owner:xxxxx@ep-xxx.neon.tech/neondb?sslmode=require
JWT_SECRET_KEY=aaaaabbbbcccc...  (64-char hex)
JWT_REFRESH_SECRET_KEY=ddddeeee...  (alag 64-char hex)
FIELD_ENCRYPTION_KEY=AbCdEf123...=  (Fernet key)
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
OPENAI_API_KEY=
ENVIRONMENT=development
DEBUG=true
```

---

## STEP 4: Backend install + database setup

PowerShell me `backend/` folder me jao:

```powershell
cd backend

# Virtual environment banao
python -m venv .venv

# Activate karo
.venv\Scripts\activate

# pip update karo (IMPORTANT)
python -m pip install --upgrade pip setuptools wheel

# Dependencies install karo
pip install -r requirements.txt
```

**Agar koi package fail ho:** `python --version` check karo — 3.14.x hona chahiye. Agar nahi, to Python 3.14 install karo.

### Database tables banao (sirf pehli baar)

```powershell
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Success message aana chahiye. Neon dashboard me Tables tab me 27 tables dikhne chahiye.

---

## STEP 5: Backend server chalao

```powershell
# backend/ folder me, .venv activated hona chahiye
uvicorn app.main:app --reload --port 8000
```

Browser me check karo: `http://localhost:8000/api/health`
Response: `{"status":"ok","environment":"development"}`

API docs: `http://localhost:8000/api/docs`

**Ye terminal band mat karo** — naya terminal kholo frontend ke liye.

---

## STEP 6: Frontend setup + chalao

Naya PowerShell window/tab kholo:

```powershell
cd frontend

# Dependencies install karo
npm install
```

`frontend/` folder me `.env.local` naam ki file banao:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws
```

Phir chalao:
```powershell
npm run dev
```

Browser me kholo: `http://localhost:3000`

---

## STEP 6.5: Ab kya kaam karta hai — Test karo

**Phase 2 — Authentication:**
1. `localhost:3000/signup` — account banao (name, email, password, business name)
2. Redirect hoga `/dashboard` par — sab working!
3. `localhost:3000/login` — dobara login karo
4. `localhost:3000/forgot-password` — password reset flow test karo

**Phase 3 — Sub Admins:**
1. `localhost:3000/sub-admins` jao
2. "Add Sub Admin" click karo
3. Email, password, role (Manager/Agent) fill karo → Create
4. Table me naya member dikhna chahiye

**Phase 4 — Inbox:**
1. `localhost:3000/inbox` jao
2. WhatsApp se message aaye to yahan dikhega (real-time)
3. "All / Requested / Intervened" tabs switch karo
4. Conversation select karo → message type karo → Enter se send

**Phase 5 — WhatsApp Connect:**
1. `localhost:3000/settings` jao
2. Meta App Dashboard se copy karo:
   - Phone Number ID
   - WABA ID (WhatsApp Business Account ID)
   - Permanent Access Token
3. Display Phone Number aur Business Name bharo
4. "Save Settings" click karo
5. Status "LIVE" ho jaega

   **Webhook setup (local testing ke liye ngrok):**
   ```powershell
   # Naya terminal me:
   ngrok http 8000
   # Copy karo: https://xxxx.ngrok.io
   ```
   Meta App Dashboard → WhatsApp → Configuration:
   - Webhook URL: `https://xxxx.ngrok.io/api/v1/webhooks/whatsapp`
   - Verify Token: apne `.env` ka `META_VERIFY_TOKEN` value dalte (koi bhi string)
   - Subscribe: `messages`, `message_deliveries`, `message_reads`

**Phase 6 — Contacts:**
1. `localhost:3000/contacts` jao
2. "+ Add Contact" → phone number (required), name, city, status fill karo
3. "Export CSV" → contacts download ho jaenge
4. "Import CSV" → CSV file upload karo (columns: phone, name, email, city)
5. Search box me naam ya phone se search karo

---

## STEP 6.6 — Phase 7: Campaigns (Broadcast Messages)

**Pehle yeh samjho:** Campaigns sirf **approved templates** se kaam
karte hain — koi bhi normal text message campaign me nahi bhej sakte
(WhatsApp ka rule hai, free-form text 24-hour window ke bahar nahi
ja sakta). Toh Phase 8 (Templates) pehle test karna padega — niche
diya hai.

**Step-by-step (Templates banane ke baad):**

1. `localhost:3000/campaigns` jao
2. "+ New Campaign" click karo
3. Form fill karo:
   - **Campaign Name:** jaise "Diwali Offer 2026"
   - **Template:** dropdown me sirf "approved" templates dikhenge —
     agar list khali hai, pehle Templates section me jao aur ek
     template approve karwao (Step 6.7 dekho)
   - **Contacts:** checkbox list se contacts select karo (jitne
     chahiye)
4. "Create Campaign" click karo — campaign "draft" status me banega
5. Campaign list me apni campaign dhundo, **"Launch"** button click
   karo
6. Status "running" ho jayega — counters (Sent / Delivered / Failed)
   live update hote hain, table ko refresh karte raho dekhne ke liye
7. Chalti hui campaign ko **"Pause"** kar sakte ho beech me — turant
   ruk jayegi (next recipient ko bhejne se pehle status check hota
   hai)
8. Paused campaign ko phir se **"Resume"** kar sakte ho (Launch
   button dobara dikhega)

**Test karne ke liye kam se kam 1 contact aur 1 approved template
chahiye.**

---

## STEP 6.7 — Phase 8: Templates (Meta Approval)

1. `localhost:3000/templates` jao
2. "+ New Template" click karo
3. Form fill karo:
   - **Template Name:** sirf lowercase + underscore (jaise
     `order_confirmed`) — automatically lowercase ho jata hai
   - **Category:** Utility (orders/updates), Marketing (offers), ya
     Authentication (OTP) choose karo
   - **Language:** English/Hindi
   - **Body Text:** message likho, variables ke liye `{{1}}`, `{{2}}`
     use karo. Example:
     ```
     Hello {{1}},

     Your order *{{2}}* has been confirmed and will be delivered soon!
     ```
   - **Footer:** optional, jaise "Reply STOP to unsubscribe"
4. "Save Draft" click karo — template "pending" status me list me
   aayega
5. Us template ke row me **"Submit"** button click karo — yeh Meta ko
   bhejega approval ke liye
6. **Important:** Meta ka approval automatic nahi hota turant — kabhi
   minutes me ho jata hai, kabhi 24 ghante tak lagte hain
7. Approval check karne ke liye **"Sync from Meta"** button (top par)
   click karo — yeh latest status la kar dikhayega:
   - 🟢 **Approved** — ab campaigns me use ho sakta hai
   - 🟡 **Pending** — Meta abhi review kar raha hai
   - 🔴 **Rejected** — reason dikhega, naya template banao

**Note:** Template submit karne ke liye WhatsApp account "Settings"
me connected hona zaroori hai (Phase 5).

---

## STEP 6.8 — Phase 9: Chatbot Rules (Auto-Reply)

1. `localhost:3000/chatbot` jao
2. "+ Add Rule" click karo
3. Form fill karo:
   - **Rule Name:** jaise "Greeting"
   - **Keywords:** comma se separate karke likho, jaise: `hi, hello,
     hey, namaste`
   - **Match Type:**
     - **Contains** — message me keyword kahin bhi ho to match
       (sabse common)
     - **Exact match** — pura message exactly keyword se match
       karna chahiye
     - **Starts with** — message keyword se shuru hona chahiye
     - **Regex** — advanced pattern matching (developers ke liye)
   - **Reply Text:** jo automatic reply jayega, jaise: "Hi! Welcome to
     our business. How can we help you today?"
4. "Add Rule" click karo
5. Rule list me dikhega — toggle switch se **active/inactive** kar
   sakte ho
6. **Test karna:** apne WhatsApp se connected business number par
   "hi" likh ke bhejo — automatic reply aana chahiye 1-2 second me

**Priority kaise kaam karti hai:** jab message aata hai, sab active
rules check hoti hain — sabse zyada priority wali rule (jo list me
upar hai) match hoti hai to wahi reply jayega, baaki rules check nahi
hongi.

---

## STEP 6.9 — Phase 10: Flow Builder (Multi-Step Conversations)

Flow Builder ek **visual drag-and-drop editor** hai jisse multi-step
conversation banate hain (jaise: "Welcome message → option choose
karo → order status batao").

1. `localhost:3000/flows` jao
2. "+ New Flow" click karo, naam do (jaise "Order Support Flow") →
   "Create & Open Editor" — seedha visual editor khulega

### Editor me kaam karna:

3. **Left side** me node palette hai — 14 types ke nodes:
   - **Message** — simple text bhejna
   - **Text & Buttons** — buttons ke saath message (user click karega)
   - **List Menu** — dropdown-style options
   - **Condition** — agar/else branching logic
   - **Save Reply** — user ka jawab variable me save karna
   - **End** — flow yahan khatam
   - (Dynamic List, Multi Product, API Call, Update Contact, Delay,
     Template, Transfer, Connect Flow — yeh node types abhi
     **future phase** ke liye reserved hain, canvas par dikhte hain
     lekin actual logic baad me aayega)

4. Kisi bhi node ko palette se **drag karke canvas par drop** karo
5. Node par click karo → right side panel me uska content edit karo
   (jaise Message node ke liye text type karo)
6. Do nodes ko connect karne ke liye, ek node ke edge se dusre node
   tak **line draw** karo (mouse se drag karo)
7. Sab kuch set karne ke baad **"Save"** button (top-right) click
   karo

### Flow ko live karna:

8. Flows list page par jao, naya flow dikhega — **toggle switch ON**
   karo "Active" karne ke liye
9. Ab is flow ko trigger karne ke 2 tarike:
   - **Welcome trigger:** flow create karte waqt trigger_type
     "welcome" set karo — naye contact ka pehla message aane par
     automatically start hoga
   - **Chatbot Rule se link:** Phase 9 me ek rule banao jiska
     "Reply" na ho, balki uska `flow_id` is flow se link ho (yeh
     abhi UI me direct option nahi hai, API se set hota hai —
     future UI update me add hoga)

### Condition node ka example:

```
Variable name: user_choice
Equals value: yes
```
Agar contact ne "yes" reply kiya to "true" path follow hoga, warna
"false" path. Edges ko "true"/"false" label do branching ke liye.

**Test karna:** Active flow ke trigger se match karke WhatsApp par
message bhejo — flow ka pehla node turant reply karega, aur jab tum
reply karoge (Text & Buttons / List Menu / Save Reply node ke baad),
flow aage badhega.

---

## STEP 6.10 — Phase 11: AI Assistant (Suggested Replies + Knowledge Base)

**Pehle ek zaroori cheez:** AI features ke liye OpenAI ka API key
chahiye. Agar abhi nahi hai to ye step skip kar sakte ho — baaki sab
phases (1-10, 12, 13) bina OpenAI key ke bhi kaam karte hain.

### OpenAI API Key lena:

1. https://platform.openai.com par account banao (agar nahi hai)
2. "API Keys" section me jao → "Create new secret key"
3. Key copy karo (sk-... se shuru hoti hai)
4. `backend/.env` file me add karo:
   ```
   OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Backend restart karo (`Ctrl+C` karke dobara `uvicorn` command
   chalao)

### Knowledge Base banana:

1. `localhost:3000/settings` jao
2. **"AI Knowledge Base"** tab click karo
3. "+ Add Document" click karo
4. Apne business ki info daalo — jaise:
   - Title: "Refund Policy"
   - Content: "Hum 7 din ke andar full refund dete hain agar product
     damaged ho ya order wrong ho..."
5. Jitne chahiye documents add karte raho — FAQs, pricing, delivery
   policy, business hours, etc.
6. Yeh documents AI ke "knowledge" ban jate hain — jab bhi AI koi
   reply suggest karega ya question ka answer dega, isi knowledge ko
   use karega

### Suggested Reply use karna:

1. `localhost:3000/inbox` jao
2. Koi bhi conversation open karo jisme kam se kam ek customer ka
   message ho
3. Message box ke bagal me **✨ (sparkle) icon** dikhega — usko click
   karo
4. 2-3 second me AI ek reply draft kar dega, message box me automatic
   type ho jayega
5. Reply ko edit kar sakte ho, phir Send button se bhej do (AI
   automatically nahi bhejta, sirf draft karta hai)

**Note:** Agar `OPENAI_API_KEY` set nahi hai, to sparkle button click
karne par error aayega ("AI features require OPENAI_API_KEY...") —
yeh normal hai, baaki app fully kaam karega.

---

## STEP 6.11 — Phase 12: Analytics Dashboard

1. `localhost:3000/analytics` jao
2. Top par period select karo: Last 7 days / 30 days / 90 days
3. Dikhega:
   - **Conversations** — total, open, resolved
   - **Contacts** — total aur naye contacts is period me
   - **Messages Sent/Received** — counts
   - **Avg Response Time** — customer ke message ka kitni der me
     jawab gaya (minutes me)
4. Niche bar chart me daily message volume dikhega (Sent vs Received)
5. Sabse niche **Campaign Performance** table — har campaign ka
   delivery rate aur read rate %

**Agar data khali dikhe:** test karne ke liye kuch messages bhejo
(Inbox se) ya ek campaign launch karo (Phase 7), phir period ko 90
days par set karo agar purana data hai.

---

## STEP 6.12 — Phase 13: Settings (Notifications, API Keys, Billing, Agents)

### Notifications:

1. `localhost:3000/settings` → **"Notifications"** tab
2. 5 toggles dikhenge — jaise jo chahiye unko ON/OFF karo:
   - New message email
   - Campaign completed
   - Template approval updates
   - Weekly summary
   - Push notifications
3. Toggle click karte hi automatically save ho jata hai

### API Keys (developers ke liye):

1. `localhost:3000/settings` → **"API Keys"** tab
2. "+ New Key" click karo, naam do (jaise "My Integration")
3. "Create Key" click karo — ek **full API key dikhega ek hi baar**
   (jaise `lwa_live_a1b2c3...`)
4. **Turant copy kar lo** — yeh dobara nahi dikhega kabhi (security
   ke liye, jaise Stripe/GitHub keys kaam karti hain)
5. Is key ko apne external apps/scripts me use kar sakte ho API call
   karne ke liye
6. Purani key revoke (delete) karni ho to list me trash icon click
   karo

### Billing & Usage:

1. `localhost:3000/billing` jao
2. Current plan dikhega (Free/Starter/Growth/Enterprise) saath me
   usage bar (kitne messages use ho gaye is period me)
3. Plan switch karna ho to dusre plan card par "Switch" click karo
4. **Note:** Abhi koi real payment gateway connected nahi hai — plan
   switch karna sirf local update hai, koi paisa nahi kategi (yeh
   future phase me Stripe/Razorpay se connect hoga)

### Agents:

1. `localhost:3000/agents` jao
2. Team ke sab members dikhenge with:
   - Online/Offline status (green dot = online)
   - Role (Admin/Manager/Agent)
   - Kitne open chats currently assign hain unko
3. Yeh same data hai jo Sub Admins page me hai, bas alag view se
   dikhaya gaya hai (workload dekhne ke liye)

---

## STEP 7: Roz development karne ka workflow

**Har baar kaam shuru karte waqt 2 terminals:**

**Terminal 1 (Backend):**
```powershell
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm run dev
```

**Agar backend me error aaye:**
- Check karo kya Redis chal raha hai
- `.env` file me sab values sahi hain
- `python --version` 3.14 ho

**Jab naya phase milega:**
- Naya zip download karo, purane folder par overwrite extract karo
- `.env` file save rakho (overwrite na ho)
- Backend me: `pip install -r requirements.txt` (agar requirements badla)
- Agar naye database columns hain: `alembic revision --autogenerate -m "phaseX" && alembic upgrade head`
- Frontend me: `npm install` (agar package.json badla)

---

## STEP 8: Background workers (AI phase ke liye, optional abhi)

**Important:** Phase 7 ke Campaigns abhi Celery worker ke bina hi
chalte hain — "Launch" button click karne par backend khud background
me (`asyncio.create_task`) dispatch kar deta hai, alag se worker
chalane ki zaroorat nahi.

Celery worker sirf **Phase 11 (AI)** se zaroori hoga jab heavy
background tasks (jaise AI-generated replies, RAG queries) queue me
daalna padega. Tab ye chalao:

```powershell
# Terminal 3 — Worker
cd backend
.venv\Scripts\activate
celery -A app.core.celery_app worker -l info -Q default,webhooks,campaigns,ai

# Terminal 4 — Beat (scheduled tasks, jaise template status auto-sync)
cd backend
.venv\Scripts\activate
celery -A app.core.celery_app beat -l info
```

---

## STEP 9 (Final): Live server deployment

Jab saare phases complete ho jayenge aur local me sab test kar lo,
tab deployment phase me yeh milega:

- Docker + Docker Compose configuration
- Nginx reverse proxy + SSL (HTTPS)
- VPS deployment guide (DigitalOcean/Hostinger/AWS)
- Domain setup aur Meta webhook final configuration

Us waqt steps honge:
1. VPS server (Ubuntu 24.04) kiraye par lo
2. Domain ka DNS server IP par point karo
3. Code upload (`git clone` ya zip)
4. `.env` file banao (production values)
5. `docker compose up --build -d`
6. SSL certificate (Let's Encrypt / Certbot)
7. Meta webhook URL update karo: `https://yourdomain.com/api/v1/webhooks/whatsapp`

---

## Common Problems aur Solutions

| Problem | Solution |
|---|---|
| `psycopg2-binary` build error | Already fixed — requirements.txt me `psycopg[binary]==3.3.4` hai |
| `orjson` / `asyncpg` / `pydantic-core` build error | Python 3.14 ke sahi versions requirements.txt me hain — delete karke fresh install karo |
| CORS error browser console me | `backend/.env` me `FRONTEND_URL=http://localhost:3000` check karo; backend chal raha ho |
| `DATABASE_URL_SYNC is not set` | `backend/.env` file sahi jagah hai aur value bhari hui hai |
| `TokenPairResponse` error | Fixed in auth_service.py — keyword args use karo |
| `MissingGreenlet` Sub Admin create me | Fixed in workspace_service.py — selectinload use karo |
| Redis connection refused | Redis start karo: `redis-server` (Mac/Linux) ya Redis service Windows me |
| Inbox me messages nahi dikh rahe | WhatsApp account "LIVE" status me hona chahiye (Settings me connect karo) |
| `alembic upgrade head` fail | Database URL sahi check karo; Neon me pgvector extension enable hai |
| `TypeError: descriptor '__getitem__' requires 'typing.Union'` | SQLAlchemy 2.0.36 Python 3.14 ke saath kaam nahi karta — `pip install sqlalchemy[asyncio]==2.0.41` |
| `npm install` me error | Node.js version check karo: `node --version` 20+ hona chahiye |
| Frontend NEXT_PUBLIC_API_URL kaam nahi kar raha | `frontend/.env.local` file exist karti hai check karo; `npm run dev` restart karo |
| Campaign Launch ke baad kuch nahi hota | Background me dispatch hota hai (turant nahi dikhega) — 5-10 second baad page refresh karo |
| Template Submit fail ho raha hai | Settings me WhatsApp account connect hona chahiye; Meta ka exact error message dekho — usme reason hota hai |
| Chatbot rule trigger nahi ho rahi | Rule "Active" honi chahiye (toggle ON); keyword spelling exact match karo; "Contains" match type sabse aasan hai testing ke liye |
| Flow Builder me canvas khali dikh raha hai | Pehli baar flow open karte waqt nodes nahi honge — left palette se drag karke add karo |
| Flow contact ke reply par respond nahi kar raha | Flow "Active" toggle ON hona chahiye, aur trigger_type "welcome" ya Chatbot Rule se linked hona chahiye |
| `npm run dev` me reactflow error | `npm install` dobara chalao — naya package add hua hai Phase 10 me |
| AI Suggest Reply button error de raha hai | `backend/.env` me `OPENAI_API_KEY` set karo aur backend restart karo |
| Knowledge Base document add nahi ho raha | OpenAI key check karo; agar key sahi hai to OpenAI account me credits/billing check karo |
| Analytics page khali dikh raha hai | Kam se kam ek conversation/message hona chahiye; period ko "90 days" try karo |
| `npm run build` me recharts error | `npm install` dobara chalao — naya package hai Phase 12 me |
| API key dobara dekhni hai (bhool gaya copy karna) | Possible nahi hai security ke liye — purani key revoke karo, nayi banao |
| Billing plan switch karne se paisa nahi kata | Normal hai — abhi payment gateway connected nahi hai, sirf plan selection hai |

---

## Important Security Notes

1. `.env` file **kabhi bhi** Git me commit mat karo
2. Production me `DEBUG=false` aur `ENVIRONMENT=production` karo
3. `FIELD_ENCRYPTION_KEY` safe rakho — isse tenant WhatsApp tokens encrypt hote hain
4. JWT keys minimum 64 characters random hone chahiye
5. Neon database password regularly rotate karo
6. Meta Access Token expose mat karo — backend me encrypted store hota hai
