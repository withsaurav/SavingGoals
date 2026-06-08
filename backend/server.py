from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import secrets
import asyncio
import bcrypt
import jwt as pyjwt
import resend
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

import razorpay
import hmac
import hashlib

# -- Razorpay Setup --
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_MONTHLY_PLAN_ID = os.environ.get("RAZORPAY_MONTHLY_PLAN_ID", "")
RAZORPAY_YEARLY_PLAN_ID = os.environ.get("RAZORPAY_YEARLY_PLAN_ID", "")

rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# -- Subscription Models --
class CreateSubscriptionIn(BaseModel):
    plan: Literal["monthly", "yearly"]

# -- Razorpay Routes --
@api.post("/payments/create-subscription")
async def create_subscription(
    data: CreateSubscriptionIn,
    user: dict = Depends(get_current_user)
):
    plan_id = RAZORPAY_MONTHLY_PLAN_ID if data.plan == "monthly" else RAZORPAY_YEARLY_PLAN_ID
    if not plan_id:
        raise HTTPException(status_code=500, detail="Payment plan not configured")
    try:
        subscription = rzp_client.subscription.create({
            "plan_id": plan_id,
            "customer_notify": 1,
            "total_count": 12 if data.plan == "monthly" else 1,
            "notes": {
                "user_id": user["id"],
                "email": user["email"],
                "plan": data.plan
            }
        })
        return {
            "subscription_id": subscription["id"],
            "razorpay_key": RAZORPAY_KEY_ID,
            "user_name": user["name"],
            "user_email": user["email"],
            "plan": data.plan
        }
    except Exception as e:
        logger.exception("Razorpay subscription creation failed")
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/payments/verify")
async def verify_payment(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    razorpay_payment_id = body.get("razorpay_payment_id", "")
    razorpay_subscription_id = body.get("razorpay_subscription_id", "")
    razorpay_signature = body.get("razorpay_signature", "")

    # Verify signature
    msg = f"{razorpay_payment_id}|{razorpay_subscription_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        msg.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Update user as subscribed in MongoDB
    plan = body.get("plan", "monthly")
    expiry = datetime.now(timezone.utc) + (
        timedelta(days=30) if plan == "monthly" else timedelta(days=365)
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "is_subscribed": True,
            "plan": plan,
            "subscription_id": razorpay_subscription_id,
            "subscription_expires_at": expiry.isoformat(),
            "subscribed_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    logger.info("User %s subscribed to %s plan", user["email"], plan)
    return {"ok": True, "plan": plan, "expires_at": expiry.isoformat()}

@api.get("/payments/status")
async def payment_status(user: dict = Depends(get_current_user)):
    return {
        "is_subscribed": user.get("is_subscribed", False),
        "plan": user.get("plan", None),
        "expires_at": user.get("subscription_expires_at", None),
    }

@api.post("/payments/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    sub_id = user.get("subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription found")
    try:
        rzp_client.subscription.cancel(sub_id, {"cancel_at_cycle_end": 1})
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"is_subscribed": False, "plan": None}}
        )
        return {"ok": True, "message": "Subscription cancelled"}
    except Exception as e:
        logger.exception("Razorpay cancel failed")
        raise HTTPException(status_code=500, detail=str(e))
        


# -- Setup --
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

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

# -- Password reset --
RESET_TOKEN_TTL_MINUTES = 60

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str
    new_password: str

class VerifyResetTokenIn(BaseModel):
    token: str

def _reset_email_html(name: str, reset_url: str, brand_name: str = "Verdant") -> str:
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#F4F7F4;font-family:Arial,Helvetica,sans-serif;color:#1a1e1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F4;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #E5E8E5;overflow:hidden;">
        <tr><td style="background:#2C4C3B;padding:28px 32px;color:#ffffff;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;">{brand_name}</div>
          <div style="font-size:13px;opacity:0.75;margin-top:2px;">Password reset</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;margin:0 0 16px;">Hi {name or "there"},</p>
          <p style="font-size:15px;line-height:1.55;margin:0 0 24px;color:#374a3f;">
            We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.
          </p>
          <p style="text-align:center;margin:32px 0;">
            <a href="{reset_url}" style="display:inline-block;background:#2C4C3B;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;">Reset password</a>
          </p>
          <p style="font-size:13px;color:#6D7570;line-height:1.55;margin:24px 0 0;">
            Or paste this link into your browser:<br/>
            <span style="font-family:monospace;font-size:12px;word-break:break-all;color:#2C4C3B;">{reset_url}</span>
          </p>
          <p style="font-size:13px;color:#6D7570;line-height:1.55;margin:24px 0 0;border-top:1px solid #E5E8E5;padding-top:20px;">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#9aa19c;margin-top:16px;">© {brand_name}</div>
    </td></tr>
  </table>
</body></html>"""


async def send_reset_email(to_email: str, name: str, reset_url: str) -> Optional[str]:
    """Send a password-reset email via Resend. Returns the email id, or None on failure / if disabled."""
    if not RESEND_API_KEY:
        return None
    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": "Reset your Verdant password",
        "html": _reset_email_html(name, reset_url),
        "text": (
            f"Hi {name or 'there'},\n\n"
            f"We received a request to reset your password.\n"
            f"Open this link to set a new password (expires in 1 hour):\n\n{reset_url}\n\n"
            f"If you didn't request this, ignore this email."
        ),
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return email.get("id") if isinstance(email, dict) else getattr(email, "id", None)
    except Exception:
        logger.exception("Resend email send failed for %s", to_email)
        return None


@api.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordIn):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    # Return generic success either way to prevent email enumeration.
    payload = {"ok": True, "message": "If that email is registered, a reset link has been sent."}

    if user:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["id"],
            "email": email,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })
        frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        reset_url = f"{frontend}/reset-password?token={token}"
        logger.warning("PASSWORD RESET LINK for %s: %s", email, reset_url)

        email_id = await send_reset_email(email, user.get("name", ""), reset_url)
        if email_id:
            payload["email_sent"] = True
        else:
            # DEV-ONLY fallback (no Resend key or send failed): expose the link in the response
            # so the user can still complete the reset. Remove for stricter production posture.
            payload["dev_reset_url"] = reset_url

    return payload


@api.post("/auth/verify-reset-token")
async def verify_reset_token(data: VerifyResetTokenIn):
    doc = await db.password_reset_tokens.find_one({"token": data.token})
    if not doc or doc.get("used"):
        return {"valid": False, "reason": "Invalid or already used token"}
    if doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return {"valid": False, "reason": "Token expired"}
    return {"valid": True, "email": doc["email"]}

@api.post("/auth/reset-password")
async def reset_password(data: ResetPasswordIn):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    doc = await db.password_reset_tokens.find_one({"token": data.token})
    if not doc or doc.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or already used token")
    if doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired. Please request a new reset link.")
    await db.users.update_one(
        {"id": doc["user_id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}},
    )
    await db.password_reset_tokens.update_one(
        {"token": data.token}, {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}}
    )
    return {"ok": True, "message": "Password updated. You can now sign in."}

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
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

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
