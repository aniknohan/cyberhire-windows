"""Billing: no free tier. New accounts get a TRIAL_DAYS free Pro trial, then Pro is required:
$19.99/month or $159/year (auto-renewing) via Stripe subscriptions or PayPal subscriptions.

Entitlement lives on the user: plan, pro_until (current period end), billing_provider, subscription ids.
The trial runs from the account's created_at.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from lib.auth import current_user
from lib.db import db
from models.schemas import BillingStatus, CheckoutIn, CheckoutOut, OkOut, PaymentStatusOut

router = APIRouter(tags=["billing"])
logger = logging.getLogger(__name__)
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
PLANS = {
    "month": {"lookup_key": "pro_monthly", "amount": "19.99", "label": "$19.99 / month", "paypal_name": "Pro Monthly", "paypal_unit": "MONTH", "days": 31},
    "year": {"lookup_key": "pro_yearly", "amount": "159.00", "label": "$159 / year", "paypal_name": "Pro Yearly", "paypal_unit": "YEAR", "days": 366},
}
TRIAL_DAYS = 3
TAX_MODE = "full"  # US + digital SaaS → Stripe manages tax & compliance


def now():
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def trial_until(user: dict) -> datetime | None:
    created = _aware(user.get("created_at"))
    return created + timedelta(days=TRIAL_DAYS) if created else None


def local_pro() -> bool:
    """CyberHire desktop is free: every account on this computer has every feature."""
    return True


def is_paid_pro(user: dict) -> bool:
    if local_pro():
        return True
    if user.get("role") == "admin":
        return True
    until = _aware(user.get("pro_until"))
    return user.get("plan") == "pro" and until is not None and until > now()


def on_trial(user: dict) -> bool:
    t = trial_until(user)
    return not is_paid_pro(user) and t is not None and t > now()


def has_access(user: dict) -> bool:
    return is_paid_pro(user) or on_trial(user)


EXPIRED_MSG = f"Your {TRIAL_DAYS}-day free trial has ended. Subscribe to Pro to keep practicing."


async def require_interview_allowance(user: dict) -> None:
    if not has_access(user):
        raise HTTPException(status_code=402, detail=EXPIRED_MSG)


async def require_pro(user: dict = Depends(current_user)) -> dict:
    if not has_access(user):
        raise HTTPException(status_code=402, detail=EXPIRED_MSG)
    return user


async def _activate(user_id: str, provider: str, until: datetime, **ids) -> None:
    await db.users.update_one({"id": user_id}, {"$set": {"plan": "pro", "pro_until": until, "billing_provider": provider,
                                                         "cancel_at_period_end": False, **ids}})


async def _activate_from_stripe_sub(user_id: str, sub_id: str | None, customer: str | None, interval: str = "month") -> None:
    interval = interval if interval in PLANS else "month"
    until = now() + timedelta(days=PLANS[interval]["days"])
    if sub_id:
        try:
            sub = await asyncio.to_thread(stripe.Subscription.retrieve, sub_id)
            end = sub.get("current_period_end") or (sub["items"]["data"][0].get("current_period_end") if sub.get("items") else None)
            if end:
                until = datetime.fromtimestamp(end, tz=timezone.utc)
        except stripe.error.StripeError as e:
            logger.warning("subscription retrieve failed: %s", e)
    await _activate(user_id, "stripe", until, billing_interval=interval, stripe_subscription_id=sub_id, stripe_customer_id=customer)


@router.get("/billing/status", response_model=BillingStatus)
async def billing_status(user: dict = Depends(current_user)):
    paid, trial = is_paid_pro(user), on_trial(user)
    return BillingStatus(
        plan="pro" if paid else "trial" if trial else "expired", is_pro=paid, has_access=paid or trial,
        on_trial=trial, trial_until=trial_until(user), trial_days=TRIAL_DAYS,
        pro_until=_aware(user.get("pro_until")), provider=user.get("billing_provider"),
        interval=user.get("billing_interval"), cancel_at_period_end=bool(user.get("cancel_at_period_end")),
        monthly_price_label=PLANS["month"]["label"], yearly_price_label=PLANS["year"]["label"],
        stripe_enabled=True, paypal_enabled=bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_SECRET")),
    )


# ---------------- Stripe ----------------
@router.post("/billing/stripe/checkout", response_model=CheckoutOut)
async def stripe_checkout(body: CheckoutIn, user: dict = Depends(current_user)):
    plan = PLANS[body.interval]
    prices = await asyncio.to_thread(lambda: stripe.Price.list(lookup_keys=[plan["lookup_key"]], active=True, limit=1).data)
    if not prices:
        raise HTTPException(status_code=500, detail="Pro plan price not configured")
    price = prices[0]
    origin = body.origin_url.rstrip("/")
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}], mode="subscription",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}", cancel_url=f"{origin}/payment/cancel",
        customer_email=user["email"], client_reference_id=user["id"],
        metadata={"user_id": user["id"], "lookup_key": plan["lookup_key"], "interval": body.interval},
        subscription_data={"metadata": {"user_id": user["id"]}},
    )

    def create():
        try:
            return stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
        except stripe.error.InvalidRequestError as e:
            msg = (e.user_message or str(e)).lower()
            if "managed" in msg or "ineligible" in msg or "customer_email" in msg:
                kw = dict(kwargs)
                return stripe.checkout.Session.create(**kw, automatic_tax={"enabled": True}, billing_address_collection="required")
            raise
    try:
        session = await asyncio.to_thread(create)
    except stripe.error.StripeError as e:
        logger.error("stripe checkout failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not start checkout")
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": user["id"], "provider": "stripe", "lookup_key": plan["lookup_key"], "interval": body.interval,
        "amount": (price.unit_amount or 0) / 100.0, "currency": price.currency,
        "status": "initiated", "payment_status": "pending", "created_at": now(), "updated_at": now(),
    })
    return CheckoutOut(checkout_url=session.url, session_id=session.id)


@router.get("/payments/status/{session_id}", response_model=PaymentStatusOut)
async def payment_status(session_id: str):
    rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if rec.get("payment_status") != "paid" and rec.get("provider") == "stripe":
        try:
            s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
            if s.payment_status == "paid" or s.status == "complete":
                res = await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": s.subscription, "updated_at": now()}})
                if res.modified_count:
                    await _activate_from_stripe_sub(rec["user_id"], s.subscription, s.customer, interval=rec.get("interval", "month"))
                rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
            elif s.status == "expired":
                await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"status": "expired", "payment_status": "expired"}})
                rec["status"], rec["payment_status"] = "expired", "expired"
        except stripe.error.StripeError:
            pass
    return PaymentStatusOut(session_id=session_id, status=rec["status"], payment_status=rec["payment_status"])


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature", ""), os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        res = await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": obj.get("subscription"), "updated_at": now()}})
        meta = obj.get("metadata") or {}
        uid = meta.get("user_id") or obj.get("client_reference_id")
        if res.modified_count and uid:
            await _activate_from_stripe_sub(uid, obj.get("subscription"), obj.get("customer"), interval=meta.get("interval", "month"))
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one({"session_id": obj["id"]}, {"$set": {"status": "expired", "payment_status": "expired", "updated_at": now()}})
    elif t in ("invoice.paid", "invoice.payment_succeeded"):
        sub_id = obj.get("subscription") or ((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription")
        u = await db.users.find_one({"stripe_subscription_id": sub_id}, {"_id": 0, "id": 1, "billing_interval": 1}) if sub_id else None
        if u:
            await _activate_from_stripe_sub(u["id"], sub_id, obj.get("customer"), interval=u.get("billing_interval") or "month")
    elif t == "customer.subscription.updated":
        await db.users.update_one({"stripe_subscription_id": obj["id"]}, {"$set": {"cancel_at_period_end": bool(obj.get("cancel_at_period_end"))}})
    elif t == "customer.subscription.deleted":
        await db.users.update_one({"stripe_subscription_id": obj["id"]}, {"$set": {"plan": "free", "pro_until": now(), "cancel_at_period_end": False}})
    return {"status": "ok"}


@router.post("/billing/cancel", response_model=OkOut)
async def cancel_subscription(user: dict = Depends(current_user)):
    provider = user.get("billing_provider")
    if provider == "stripe" and user.get("stripe_subscription_id"):
        await asyncio.to_thread(stripe.Subscription.modify, user["stripe_subscription_id"], cancel_at_period_end=True)
    elif provider == "paypal" and user.get("paypal_subscription_id"):
        token = await _paypal_token()
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{_paypal_base()}/v1/billing/subscriptions/{user['paypal_subscription_id']}/cancel",
                             headers={"Authorization": f"Bearer {token}"}, json={"reason": "Cancelled by customer"})
        if r.status_code not in (204, 422):
            raise HTTPException(status_code=502, detail="PayPal cancellation failed")
    else:
        raise HTTPException(status_code=400, detail="No active subscription")
    await db.users.update_one({"id": user["id"]}, {"$set": {"cancel_at_period_end": True}})
    return OkOut()


# ---------------- PayPal (enabled when PAYPAL_CLIENT_ID + PAYPAL_SECRET are set) ----------------
def _paypal_base() -> str:
    return "https://api-m.paypal.com" if os.environ.get("PAYPAL_MODE") == "live" else "https://api-m.sandbox.paypal.com"


async def _paypal_token() -> str:
    cid, sec = os.environ.get("PAYPAL_CLIENT_ID"), os.environ.get("PAYPAL_SECRET")
    if not (cid and sec):
        raise HTTPException(status_code=503, detail="PayPal isn't set up yet — please pay with card for now.")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{_paypal_base()}/v1/oauth2/token", auth=(cid, sec), data={"grant_type": "client_credentials"})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="PayPal authentication failed")
    return r.json()["access_token"]


async def _paypal_plan_id(token: str, interval: str) -> str:
    plan = PLANS[interval]
    key = f"paypal_plan_{interval}_{_paypal_base()}"
    cfg = await db.settings.find_one({"key": key}, {"_id": 0})
    if cfg:
        return cfg["value"]
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as c:
        prod = await c.post(f"{_paypal_base()}/v1/catalogs/products", headers=h,
                            json={"name": "CyberHire Pro", "type": "SERVICE", "category": "SOFTWARE"})
        plan = await c.post(f"{_paypal_base()}/v1/billing/plans", headers=h, json={
            "product_id": prod.json()["id"], "name": plan["paypal_name"],
            "billing_cycles": [{"frequency": {"interval_unit": plan["paypal_unit"], "interval_count": 1}, "tenure_type": "REGULAR", "sequence": 1,
                                "total_cycles": 0, "pricing_scheme": {"fixed_price": {"value": plan["amount"], "currency_code": "USD"}}}],
            "payment_preferences": {"auto_bill_outstanding": True, "payment_failure_threshold": 2}})
    if plan.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Could not create PayPal plan")
    pid = plan.json()["id"]
    await db.settings.update_one({"key": key}, {"$set": {"value": pid}}, upsert=True)
    return pid


@router.post("/billing/paypal/checkout", response_model=CheckoutOut)
async def paypal_checkout(body: CheckoutIn, user: dict = Depends(current_user)):
    token = await _paypal_token()
    plan_id = await _paypal_plan_id(token, body.interval)
    origin = body.origin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{_paypal_base()}/v1/billing/subscriptions", headers={"Authorization": f"Bearer {token}"}, json={
            "plan_id": plan_id, "custom_id": user["id"],
            "application_context": {"brand_name": "CyberHire", "user_action": "SUBSCRIBE_NOW",
                                    "return_url": f"{origin}/payment/success?provider=paypal", "cancel_url": f"{origin}/payment/cancel"}})
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Could not start PayPal checkout")
    sub = r.json()
    approve = next((link["href"] for link in sub.get("links", []) if link.get("rel") == "approve"), None)
    await db.payment_transactions.insert_one({"session_id": sub["id"], "user_id": user["id"], "provider": "paypal", "interval": body.interval, "amount": float(PLANS[body.interval]["amount"]),
                                              "currency": "usd", "status": "initiated", "payment_status": "pending", "created_at": now(), "updated_at": now()})
    return CheckoutOut(checkout_url=approve or "", session_id=sub["id"])


@router.post("/billing/paypal/confirm/{subscription_id}", response_model=PaymentStatusOut)
async def paypal_confirm(subscription_id: str, user: dict = Depends(current_user)):
    rec = await db.payment_transactions.find_one({"session_id": subscription_id, "user_id": user["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Subscription not found")
    token = await _paypal_token()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_paypal_base()}/v1/billing/subscriptions/{subscription_id}", headers={"Authorization": f"Bearer {token}"})
    data = r.json() if r.status_code == 200 else {}
    if data.get("status") == "ACTIVE":
        nxt = (data.get("billing_info") or {}).get("next_billing_time")
        interval = rec.get("interval", "month")
        until = datetime.fromisoformat(nxt.replace("Z", "+00:00")) if nxt else now() + timedelta(days=PLANS[interval]["days"])
        await db.payment_transactions.update_one({"session_id": subscription_id}, {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now()}})
        await _activate(user["id"], "paypal", until, billing_interval=interval, paypal_subscription_id=subscription_id)
        return PaymentStatusOut(session_id=subscription_id, status="completed", payment_status="paid")
    return PaymentStatusOut(session_id=subscription_id, status=rec["status"], payment_status=rec["payment_status"])
