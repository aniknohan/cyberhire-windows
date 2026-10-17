import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock, CreditCard, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, IS_NATIVE, WEB_ORIGIN, apiGet, apiPost } from "@/lib/api";
import type { BillingStatus, CheckoutOut, PaymentStatusOut } from "@/lib/types";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Eyebrow, Panel } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRO = ["Unlimited live interviews — all 4 rounds", "SOC investigations, hiring decision + full report", "10-minute weakness drills & practice modules", "Resume upload — interviewers ask about your real jobs"];
type Interval = "month" | "year";

export default function Pricing() {
  const qc = useQueryClient();
  const { data: b } = useQuery({ queryKey: ["billing"], queryFn: () => apiGet<BillingStatus>("/billing/status") });
  const checkout = useMutation({
    mutationFn: (v: { provider: "stripe" | "paypal"; interval: Interval }) =>
      apiPost<CheckoutOut>(`/billing/${v.provider}/checkout`, { origin_url: IS_NATIVE ? WEB_ORIGIN : window.location.origin, interval: v.interval }),
    onSuccess: (r) => {
      if (IS_NATIVE) toast("Finish paying in your browser, then come back to CyberHire — Pro unlocks automatically.", { duration: 10000 });
      window.location.href = r.checkout_url;
    },
    onError: (e) => toast.error(e instanceof ApiError ? String((e.body as { detail?: string })?.detail ?? "Checkout failed") : "Checkout failed"),
  });
  const cancel = useMutation({
    mutationFn: () => apiPost("/billing/cancel"),
    onSuccess: () => {
      toast.success("Auto-renew turned off. Pro stays active until the end of your billing period.");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: () => toast.error("Couldn't cancel. Please try again."),
  });
  const busy = (p: "stripe" | "paypal", i: Interval) => checkout.isPending && checkout.variables?.provider === p && checkout.variables?.interval === i;
  const plans: { interval: Interval; title: string; price: string; unit: string; note: string; badge?: string }[] = [
    { interval: "month", title: "Pro Monthly", price: "$19.99", unit: "/ month", note: "Renews every month. Cancel anytime." },
    { interval: "year", title: "Pro Yearly", price: "$159", unit: "/ year", note: "Just $13.25/month, billed yearly. Cancel anytime.", badge: "Save 34%" },
  ];
  return (
    <AppShell>
      <PageHeader eyebrow="Plans" title="Prepare without limits" desc={`Every new account starts with a ${b?.trial_days ?? 3}-day free Pro trial. Pick a plan to keep practicing after it ends.`} />
      {b && !b.is_pro && (
        <div
          className={cn("mb-6 flex max-w-4xl items-start gap-3 rounded-xl border px-4 py-3 text-sm", b.on_trial ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-100" : "border-rose-400/25 bg-rose-400/[0.06] text-rose-100")}
          data-testid="trial-status-banner"
        >
          <Clock className="mt-0.5 size-4 shrink-0" />
          {b.on_trial && b.trial_until ? (
            <span>Your free Pro trial is active until <b data-testid="trial-ends-at">{new Date(b.trial_until).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</b>. Everything is unlocked — subscribe any time to keep access.</span>
          ) : (
            <span>Your free trial has ended. Subscribe to continue interviews, drills, practice and resume upload. Your past reports stay available.</span>
          )}
        </div>
      )}
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((p) => {
          const current = b?.is_pro && (b.interval ?? "month") === p.interval && !!b.provider;
          return (
            <Panel
              key={p.interval}
              className={cn("relative space-y-4", p.interval === "year" && "border-sky-500/30 bg-gradient-to-b from-[#0F1A30] to-[#0E1524]")}
              data-testid={`plan-${p.interval}`}
            >
              <div className="flex items-center justify-between">
                <Eyebrow className={p.interval === "year" ? "text-sky-400/80" : undefined}>{p.title}</Eyebrow>
                {p.badge && <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-emerald-300" data-testid="plan-year-savings">{p.badge}</span>}
              </div>
              <div className="font-heading text-4xl font-semibold text-white" data-testid={`plan-${p.interval}-price`}>
                {p.price}<span className="text-base font-normal text-slate-400"> {p.unit}</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-200">{PRO.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-sky-400" />{f}</li>)}</ul>
              {b?.is_pro ? (
                current ? (
                  <div className="space-y-2 text-sm" data-testid="pro-active">
                    <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="size-4" /> Your current plan</div>
                    {b.pro_until && <div className="text-xs text-slate-400">{b.cancel_at_period_end ? "Ends" : "Renews"} on {new Date(b.pro_until).toLocaleDateString()} · via {b.provider === "stripe" ? "card" : "PayPal"}</div>}
                    {!b.cancel_at_period_end && (
                      <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending} data-testid="cancel-subscription-button">Cancel auto-renew</Button>
                    )}
                  </div>
                ) : !b.provider ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-300" data-testid={`plan-${p.interval}-included`}><CheckCircle2 className="size-4" /> Included with your account</div>
                ) : null
              ) : (
                <div className="space-y-2">
                  <Button size="lg" className="h-11 w-full" onClick={() => checkout.mutate({ provider: "stripe", interval: p.interval })} disabled={checkout.isPending} data-testid={`checkout-stripe-${p.interval}-button`}>
                    {busy("stripe", p.interval) ? <Loader2 className="animate-spin" /> : <CreditCard />} Subscribe with card
                  </Button>
                  <Button size="lg" variant="secondary" className="h-11 w-full" onClick={() => checkout.mutate({ provider: "paypal", interval: p.interval })} disabled={checkout.isPending || !b?.paypal_enabled} data-testid={`checkout-paypal-${p.interval}-button`}>
                    {busy("paypal", p.interval) && <Loader2 className="animate-spin" />} Subscribe with PayPal
                  </Button>
                  <p className="text-[11px] text-slate-500">{p.note}</p>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
      {b && !b.is_pro && !b.paypal_enabled && <p className="mt-4 text-[11px] text-slate-500" data-testid="paypal-unavailable">PayPal is coming soon — card payments are available now.</p>}
    </AppShell>
  );
}

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const sessionId = params.get("session_id");
  const paypalSub = params.get("subscription_id");
  const [state, setState] = useState<"checking" | "paid" | "failed" | "timeout">("checking");
  const tries = useRef(0);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const r = paypalSub
          ? await apiPost<PaymentStatusOut>(`/billing/paypal/confirm/${paypalSub}`)
          : await apiGet<PaymentStatusOut>(`/payments/status/${sessionId}`);
        if (r.payment_status === "paid") {
          setState("paid");
          qc.invalidateQueries({ queryKey: ["billing"] });
          return;
        }
        if (r.payment_status === "expired" || r.status === "failed") return setState("failed");
      } catch {
        /* keep polling */
      }
      if (++tries.current >= 15) return setState("timeout");
      setTimeout(poll, 2000);
    };
    if (sessionId || paypalSub) poll();
    else setState("failed");
    return () => {
      stop = true;
    };
  }, [sessionId, paypalSub, qc]);
  return (
    <AppShell>
      <Panel className="mx-auto max-w-md space-y-4 text-center" data-testid="payment-success-page">
        {state === "checking" && <><Loader2 className="mx-auto size-8 animate-spin text-sky-400" /><div className="text-white">Confirming your payment…</div></>}
        {state === "paid" && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-emerald-400" />
            <div className="font-heading text-2xl text-white" data-testid="payment-confirmed">Welcome to Pro</div>
            <p className="text-sm text-slate-400">Unlimited interviews, drills and resume upload are unlocked.</p>
            <Link to="/interview/new" className={buttonVariants()} data-testid="payment-start-interview">Start an interview</Link>
          </>
        )}
        {(state === "failed" || state === "timeout") && (
          <>
            <XCircle className="mx-auto size-10 text-amber-400" />
            <div className="text-white">{state === "timeout" ? "Still processing — check back in a minute." : "We couldn't confirm this payment."}</div>
            <Link to="/pricing" className={buttonVariants({ variant: "secondary" })} data-testid="payment-back-pricing">Back to plans</Link>
          </>
        )}
      </Panel>
    </AppShell>
  );
}

export function PaymentCancel() {
  return (
    <AppShell>
      <Panel className="mx-auto max-w-md space-y-4 text-center" data-testid="payment-cancel-page">
        <div className="font-heading text-2xl text-white">Checkout cancelled</div>
        <p className="text-sm text-slate-400">No charge was made. You can subscribe whenever you're ready.</p>
        <Link to="/pricing" className={buttonVariants()} data-testid="payment-cancel-back">Back to plans</Link>
      </Panel>
    </AppShell>
  );
}
