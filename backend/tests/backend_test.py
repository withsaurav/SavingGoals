"""Backend API tests for the Verdant Salary Budgeting app."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else None
if not BASE_URL:
    # Fallback: read from frontend/.env
    fe_env = "/app/frontend/.env"
    with open(fe_env) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@budget.app"
ADMIN_PASS = "admin123"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def new_user():
    """Register a fresh user for isolated testing."""
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "TEST User",
        "email": email,
        "password": "Pa$$word123",
        "currency": "USD",
        "monthly_salary": 6000,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "token": data["token"], "id": data["id"]}


@pytest.fixture(scope="session")
def user_headers(new_user):
    return {"Authorization": f"Bearer {new_user['token']}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert isinstance(d["token"], str) and len(d["token"]) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_register_and_duplicate(self):
        email = f"TEST_dup_{uuid.uuid4().hex[:6]}@example.com"
        p = {"name": "Dup", "email": email, "password": "Pass1234", "currency": "EUR", "monthly_salary": 1000}
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["currency"] == "EUR"
        assert d["monthly_salary"] == 1000
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r2.status_code == 400

    def test_me_with_bearer(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        # Should not leak password hash or _id
        body = r.json()
        assert "password_hash" not in body
        assert "_id" not in body

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---------------- Budget Settings ----------------
class TestBudget:
    def test_get_settings(self, user_headers):
        r = requests.get(f"{API}/budget/settings", headers=user_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["needs_pct"] + d["wants_pct"] + d["savings_pct"] == 100

    def test_update_settings_valid(self, user_headers):
        payload = {"monthly_salary": 7500, "currency": "USD",
                   "needs_pct": 60, "wants_pct": 20, "savings_pct": 20}
        r = requests.put(f"{API}/budget/settings", json=payload, headers=user_headers, timeout=30)
        assert r.status_code == 200
        # verify persistence via GET
        r2 = requests.get(f"{API}/budget/settings", headers=user_headers, timeout=30)
        d = r2.json()
        assert d["monthly_salary"] == 7500
        assert d["needs_pct"] == 60

    def test_update_settings_bad_sum(self, user_headers):
        payload = {"monthly_salary": 7500, "currency": "USD",
                   "needs_pct": 60, "wants_pct": 30, "savings_pct": 20}
        r = requests.put(f"{API}/budget/settings", json=payload, headers=user_headers, timeout=30)
        assert r.status_code == 400


# ---------------- Transactions ----------------
class TestTransactions:
    created_ids = []

    def test_create_expense(self, user_headers):
        p = {"type": "expense", "amount": 120.5, "category": "Groceries",
             "bucket": "needs", "note": "TEST", "date": "2026-01-10"}
        r = requests.post(f"{API}/transactions", json=p, headers=user_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 120.5
        assert d["bucket"] == "needs"
        assert d["type"] == "expense"
        assert "id" in d
        TestTransactions.created_ids.append(d["id"])

    def test_create_income_forces_bucket_income(self, user_headers):
        p = {"type": "income", "amount": 500, "category": "Side",
             "bucket": "needs", "note": "TEST", "date": "2026-01-15"}
        r = requests.post(f"{API}/transactions", json=p, headers=user_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["bucket"] == "income"
        TestTransactions.created_ids.append(d["id"])

    def test_list_transactions(self, user_headers):
        r = requests.get(f"{API}/transactions", headers=user_headers, timeout=30)
        assert r.status_code == 200
        ids = {t["id"] for t in r.json()}
        for tid in TestTransactions.created_ids:
            assert tid in ids

    def test_delete_transaction(self, user_headers):
        # create then delete
        p = {"type": "expense", "amount": 5, "category": "Misc",
             "bucket": "wants", "note": "TEST_del", "date": "2026-01-20"}
        r = requests.post(f"{API}/transactions", json=p, headers=user_headers, timeout=30)
        tid = r.json()["id"]
        rd = requests.delete(f"{API}/transactions/{tid}", headers=user_headers, timeout=30)
        assert rd.status_code == 200
        # verify gone
        rl = requests.get(f"{API}/transactions", headers=user_headers, timeout=30)
        ids = {t["id"] for t in rl.json()}
        assert tid not in ids

    def test_delete_unknown(self, user_headers):
        r = requests.delete(f"{API}/transactions/{uuid.uuid4()}", headers=user_headers, timeout=30)
        assert r.status_code == 404


# ---------------- Goals ----------------
class TestGoals:
    goal_id = None

    def test_create_goal(self, user_headers):
        p = {"name": "TEST Emergency Fund", "target_amount": 1000, "saved_amount": 100, "deadline": "2026-12-31"}
        r = requests.post(f"{API}/goals", json=p, headers=user_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST Emergency Fund"
        assert d["target_amount"] == 1000
        TestGoals.goal_id = d["id"]

    def test_list_goals(self, user_headers):
        r = requests.get(f"{API}/goals", headers=user_headers, timeout=30)
        assert r.status_code == 200
        assert any(g["id"] == TestGoals.goal_id for g in r.json())

    def test_update_goal(self, user_headers):
        p = {"name": "TEST Emergency Fund", "target_amount": 1000, "saved_amount": 250, "deadline": "2026-12-31"}
        r = requests.put(f"{API}/goals/{TestGoals.goal_id}", json=p, headers=user_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["saved_amount"] == 250

    def test_delete_goal(self, user_headers):
        r = requests.delete(f"{API}/goals/{TestGoals.goal_id}", headers=user_headers, timeout=30)
        assert r.status_code == 200
        rl = requests.get(f"{API}/goals", headers=user_headers, timeout=30)
        assert not any(g["id"] == TestGoals.goal_id for g in rl.json())


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard_structure(self, user_headers):
        r = requests.get(f"{API}/dashboard", headers=user_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["monthly_salary", "income", "expenses", "net",
                  "by_bucket", "by_category", "budgets", "percentages", "recent"]:
            assert k in d, f"missing {k}"
        assert set(d["by_bucket"].keys()) >= {"needs", "wants", "savings"}


# ---------------- Advisor (Claude) ----------------
class TestAdvisor:
    def test_advisor_ask(self, user_headers):
        r = requests.post(f"{API}/advisor/ask",
                          json={"message": "Give me one tip to save more this month."},
                          headers=user_headers, timeout=90)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "")
        assert isinstance(reply, str)
        assert len(reply.strip()) > 20, f"reply too short: {reply!r}"
