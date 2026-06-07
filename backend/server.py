from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

# -- Setup --
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -- Helpers --
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())

def create_access_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "access"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        user.pop("_id", None)
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=604800, path="/",
    )

# -- Models --
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    currency: str = "USD"
    monthly_salary: float = 0

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    currency: str
    monthly_salary: float

class TransactionIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    category: str
    bucket: Literal["needs", "wants", "savings", "income"] = "needs"
    note: str = ""
    date: str  # ISO date string YYYY-MM-DD
    goal_id: Optional[str] = None  # only meaningful for savings bucket

class TransactionOut(TransactionIn):
    id: str
    user_id: str
    created_at: str

class BudgetSettings(BaseModel):
    monthly_salary: float
    currency: str
    needs_pct: float = 50
    wants_pct: float = 30
    savings_pct: float = 20

class SavingsGoalIn(BaseModel):
    name: str
    target_amount: float
    saved_amount: float = 0
    deadline: Optional[str] = None  # ISO

class SavingsGoalOut(SavingsGoalIn):
    id: str
    user_id: str
    created_at: str

class AdvisorIn(BaseModel):
    message: str

# -- Auth Routes --
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid, "name": data.name, "email": email,
        "password_hash": hash_password(data.password),
        "currency": data.currency, "monthly_salary": data.monthly_salary,
        "needs_pct": 50, "wants_pct": 30, "savings_pct": 20,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"id": uid, "name": data.name, "email": email,
            "currency": data.currency, "monthly_salary": data.monthly_salary,
            "token": token}

@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"id": user["id"], "name": user["name"], "email": email,
            "currency": user.get("currency", "USD"),
            "monthly_salary": user.get("monthly_salary", 0),
            "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# -- Budget Settings --
@api.get("/budget/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return {
        "monthly_salary": user.get("monthly_salary", 0),
        "currency": user.get("currency", "USD"),
        "needs_pct": user.get("needs_pct", 50),
        "wants_pct": user.get("wants_pct", 30),
        "savings_pct": user.get("savings_pct", 20),
    }

@api.put("/budget/settings")
async def update_settings(data: BudgetSettings, user: dict = Depends(get_current_user)):
    total = data.needs_pct + data.wants_pct + data.savings_pct
    if abs(total - 100) > 0.01:
        raise HTTPException(status_code=400, detail="Percentages must sum to 100")
    await db.users.update_one({"id": user["id"]}, {"$set": data.model_dump()})
    return {"ok": True, **data.model_dump()}

# -- Transactions --
@api.post("/transactions", response_model=TransactionOut)
async def create_tx(data: TransactionIn, user: dict = Depends(get_current_user)):
    tx = {
        **data.model_dump(),
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if tx["type"] == "income":
        tx["bucket"] = "income"
        tx["goal_id"] = None

    # Validate goal_id (only meaningful for savings expenses)
    if tx["goal_id"]:
        if tx["type"] != "expense" or tx["bucket"] != "savings":
            tx["goal_id"] = None  # ignore on non-savings rows
        else:
            goal = await db.goals.find_one({"id": tx["goal_id"], "user_id": user["id"]})
            if not goal:
                raise HTTPException(status_code=400, detail="Selected goal not found")

    await db.transactions.insert_one(tx)

    # Credit the goal's saved_amount
    if tx.get("goal_id"):
        await db.goals.update_one(
            {"id": tx["goal_id"], "user_id": user["id"]},
            {"$inc": {"saved_amount": tx["amount"]}},
        )

    tx.pop("_id", None)
    return tx

@api.get("/transactions", response_model=List[TransactionOut])
async def list_tx(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if month:  # YYYY-MM
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs

@api.delete("/transactions/{tx_id}")
async def delete_tx(tx_id: str, user: dict = Depends(get_current_user)):
    tx = await db.transactions.find_one({"id": tx_id, "user_id": user["id"]})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    # Reverse the goal credit if applicable
    if tx.get("goal_id"):
        await db.goals.update_one(
            {"id": tx["goal_id"], "user_id": user["id"]},
            {"$inc": {"saved_amount": -tx["amount"]}},
        )
    return {"ok": True}

# -- Savings Goals --
@api.post("/goals", response_model=SavingsGoalOut)
async def create_goal(data: SavingsGoalIn, user: dict = Depends(get_current_user)):
    g = {
        **data.model_dump(),
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.goals.insert_one(g)
    g.pop("_id", None)
    return g

@api.get("/goals", response_model=List[SavingsGoalOut])
async def list_goals(user: dict = Depends(get_current_user)):
    return await db.goals.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)

@api.put("/goals/{gid}", response_model=SavingsGoalOut)
async def update_goal(gid: str, data: SavingsGoalIn, user: dict = Depends(get_current_user)):
    res = await db.goals.update_one(
        {"id": gid, "user_id": user["id"]},
        {"$set": data.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    g = await db.goals.find_one({"id": gid}, {"_id": 0})
    return g

@api.delete("/goals/{gid}")
async def delete_goal(gid: str, user: dict = Depends(get_current_user)):
    res = await db.goals.delete_one({"id": gid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"ok": True}

def _next_month(ym: str) -> str:
    """YYYY-MM → next month YYYY-MM."""
    y, m = int(ym[:4]), int(ym[5:7])
    m += 1
    if m == 13:
        m = 1
        y += 1
    return f"{y:04d}-{m:02d}"

def _active_month(user: dict) -> str:
    return user.get("active_month") or datetime.now(timezone.utc).strftime("%Y-%m")

# -- Dashboard summary --
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    month = _active_month(user)
    txs = await db.transactions.find(
        {"user_id": user["id"], "date": {"$regex": f"^{month}"}},
        {"_id": 0},
    ).to_list(2000)

    income = sum(t["amount"] for t in txs if t["type"] == "income")
    expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    by_bucket = {"needs": 0, "wants": 0, "savings": 0}
    by_category = {}
    for t in txs:
        if t["type"] == "expense":
            by_bucket[t.get("bucket", "needs")] = by_bucket.get(t.get("bucket", "needs"), 0) + t["amount"]
            by_category[t["category"]] = by_category.get(t["category"], 0) + t["amount"]

    salary = user.get("monthly_salary", 0)
    needs_pct = user.get("needs_pct", 50)
    wants_pct = user.get("wants_pct", 30)
    savings_pct = user.get("savings_pct", 20)

    budgets = {
        "needs": salary * needs_pct / 100,
        "wants": salary * wants_pct / 100,
        "savings": salary * savings_pct / 100,
    }
    return {
        "month": month,
        "currency": user.get("currency", "USD"),
        "monthly_salary": salary,
        "income": income,
        "expenses": expenses,
        "balance": income + salary - expenses if income == 0 else income - expenses,
        "net": (salary + income) - expenses,
        "by_bucket": by_bucket,
        "by_category": by_category,
        "budgets": budgets,
        "percentages": {"needs": needs_pct, "wants": wants_pct, "savings": savings_pct},
        "recent": sorted(txs, key=lambda x: x["date"], reverse=True)[:5],
    }

# -- Month archives (close-out) --
@api.post("/months/close")
async def close_month(user: dict = Depends(get_current_user), month: Optional[str] = None):
    """Snapshot the given month (default: active month) and clear those transactions.
    Goals are NOT touched — they carry forward as-is. The user's active month is
    advanced to the next calendar month so the Dashboard starts fresh."""
    if not month:
        month = _active_month(user)

    existing = await db.month_archives.find_one({"user_id": user["id"], "month": month})
    if existing:
        raise HTTPException(status_code=400, detail=f"{month} is already archived")

    # Snapshot of the dashboard (uses current month logic, so override month filter)
    txs = await db.transactions.find(
        {"user_id": user["id"], "date": {"$regex": f"^{month}"}},
        {"_id": 0},
    ).to_list(5000)

    if not txs:
        raise HTTPException(status_code=400, detail=f"No transactions to archive for {month}")

    income = sum(t["amount"] for t in txs if t["type"] == "income")
    expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    by_bucket = {"needs": 0, "wants": 0, "savings": 0}
    by_category = {}
    for t in txs:
        if t["type"] == "expense":
            by_bucket[t.get("bucket", "needs")] = by_bucket.get(t.get("bucket", "needs"), 0) + t["amount"]
            by_category[t["category"]] = by_category.get(t["category"], 0) + t["amount"]

    salary = user.get("monthly_salary", 0)
    needs_pct = user.get("needs_pct", 50)
    wants_pct = user.get("wants_pct", 30)
    savings_pct = user.get("savings_pct", 20)
    archive = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "month": month,
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "currency": user.get("currency", "USD"),
        "monthly_salary": salary,
        "percentages": {"needs": needs_pct, "wants": wants_pct, "savings": savings_pct},
        "budgets": {
            "needs": salary * needs_pct / 100,
            "wants": salary * wants_pct / 100,
            "savings": salary * savings_pct / 100,
        },
        "income": income,
        "expenses": expenses,
        "net": (salary + income) - expenses,
        "by_bucket": by_bucket,
        "by_category": by_category,
        "transactions": txs,
        "tx_count": len(txs),
    }
    await db.month_archives.insert_one(archive)
    await db.transactions.delete_many(
        {"user_id": user["id"], "date": {"$regex": f"^{month}"}}
    )
    # Advance the active month so the Dashboard reflects the new period
    new_active = _next_month(month)
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"active_month": new_active}}
    )
    archive.pop("_id", None)
    archive["new_active_month"] = new_active
    return archive

@api.get("/months/archives")
async def list_archives(user: dict = Depends(get_current_user)):
    docs = await db.month_archives.find(
        {"user_id": user["id"]}, {"_id": 0, "transactions": 0}
    ).sort("month", -1).to_list(120)
    return docs

@api.get("/months/archives/{month}")
async def get_archive(month: str, user: dict = Depends(get_current_user)):
    doc = await db.month_archives.find_one({"user_id": user["id"], "month": month}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archive not found")
    return doc

@api.delete("/months/archives/{month}")
async def reopen_archive(month: str, user: dict = Depends(get_current_user)):
    """Restore an archived month's transactions and remove the archive.
    The user's active month is set back to this reopened month."""
    doc = await db.month_archives.find_one({"user_id": user["id"], "month": month}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Archive not found")
    if doc.get("transactions"):
        await db.transactions.insert_many([{**t} for t in doc["transactions"]])
    await db.month_archives.delete_one({"user_id": user["id"], "month": month})
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_month": month}})
    return {"ok": True, "restored": len(doc.get("transactions", [])), "active_month": month}

class ActiveMonthIn(BaseModel):
    month: str  # YYYY-MM

@api.put("/months/active")
async def set_active_month(data: ActiveMonthIn, user: dict = Depends(get_current_user)):
    """Manually set the active dashboard month (e.g. to navigate forward or back)."""
    if not (len(data.month) == 7 and data.month[4] == "-"):
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_month": data.month}})
    return {"ok": True, "active_month": data.month}


# -- AI Advisor (Claude streaming) --
def _build_context_str(user: dict, snapshot: dict) -> str:
    cur = user.get("currency", "USD")
    return (
        f"User: {user['name']}. Currency: {cur}. Monthly salary: {snapshot['monthly_salary']}. "
        f"This month income: {snapshot['income']}, expenses: {snapshot['expenses']}, net: {snapshot['net']}. "
        f"Budget split (needs/wants/savings %): {snapshot['percentages']}. "
        f"Spent by bucket: {snapshot['by_bucket']}. "
        f"Top categories spent: {snapshot['by_category']}. "
        f"Budgets: {snapshot['budgets']}."
    )

@api.post("/advisor/chat")
async def advisor_chat(data: AdvisorIn, user: dict = Depends(get_current_user)):
    snapshot = await dashboard(user)
    ctx = _build_context_str(user, snapshot)
    system_msg = (
        "You are Sage, a friendly, encouraging personal finance advisor. "
        "Speak in clear, warm, concise prose (no bullet lists unless asked). "
        "Use the user's live budget snapshot to give specific, actionable, "
        "non-judgmental advice. Keep replies under 180 words. "
        f"Current snapshot: {ctx}"
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"advisor-{user['id']}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def event_gen():
        try:
            async for ev in chat.stream_message(UserMessage(text=data.message)):
                if isinstance(ev, TextDelta):
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    yield "data: [DONE]\n\n"
                    break
        except Exception as e:
            logger.exception("advisor error")
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@api.post("/advisor/ask")
async def advisor_ask(data: AdvisorIn, user: dict = Depends(get_current_user)):
    """Non-streaming version that aggregates the full reply."""
    snapshot = await dashboard(user)
    ctx = _build_context_str(user, snapshot)
    system_msg = (
        "You are Sage, a friendly, encouraging personal finance advisor. "
        "Speak in clear, warm, concise prose. Use the user's live snapshot for "
        "specific, actionable advice. Keep replies under 180 words. "
        f"Current snapshot: {ctx}"
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"advisor-{user['id']}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    parts = []
    async for ev in chat.stream_message(UserMessage(text=data.message)):
        if isinstance(ev, TextDelta):
            parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return {"reply": "".join(parts)}

# -- Startup --
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.goals.create_index("user_id")
    await db.month_archives.create_index([("user_id", 1), ("month", -1)], unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@budget.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "currency": "USD",
            "monthly_salary": 5000,
            "needs_pct": 50, "wants_pct": 30, "savings_pct": 20,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)
