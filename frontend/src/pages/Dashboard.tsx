import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Play, TrendingUp, TrendingDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { Overview } from "@/lib/types";
import { MODULE_INFO, fmtDuration, scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import { Bar, DecisionBadge, EmptyState, Eyebrow, Panel, ScoreRing, Stat } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { StartDrillButton } from "@/pages/Drill";

export default function Dashboard() {
  const { data: me } = useMe();
  const { data: ov, isError } = useQuery({ queryKey: ["overview"], queryFn: () => apiGet<Overview>("/stats/overview") });
  const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n));

  return (
    <AppShell>
      <div className="mb-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#0F1A30] to-[#0B111E] p-8">
          <div className="absolute -top-20 -right-20 size-72 rounded-full bg-blue-600/15 blur-3xl" />
          <Eyebrow className="text-sky-400/80">Welcome back, {me?.name?.split(" ")[0]}</Eyebrow>
          <h1 className="mt-3 max-w-lg font-heading text-3xl leading-tight font-semibold tracking-tight text-white sm:text-4xl" data-testid="dashboard-headline">
            Your next interview is one click away.
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-400">A recruiter, a senior analyst, an IR lead and a SOC manager are ready to meet you. Answer out loud, just like the real thing.</p>
          <Link to="/interview/new" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5 text-base")} data-testid="dashboard-start-interview-button">
            <Play className="size-4" /> START INTERVIEW
          </Link>
        </div>
        <Panel className="flex items-center justify-around gap-4">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing value={ov?.job_readiness} testId="dashboard-job-readiness" />
            <Eyebrow>Job readiness</Eyebrow>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ScoreRing value={ov?.communication_readiness} testId="dashboard-communication-readiness" />
            <Eyebrow>Communication</Eyebrow>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Interviews" value={ov?.total_interviews ?? "—"} testId="stat-total-interviews" />
        <Stat label="Interview hours" value={ov ? ov.interview_hours.toFixed(1) : "—"} testId="stat-interview-hours" />
        <Stat label="Hiring rate" value={ov?.hiring_rate != null ? `${Math.round(ov.hiring_rate)}%` : "—"} testId="stat-hiring-rate" />
        <Stat label="Questions answered" value={ov?.questions_answered ?? "—"} testId="stat-questions-answered" />
        <Stat label="Technical score" value={<span className={scoreColor(ov?.technical_score)}>{fmt(ov?.technical_score)}</span>} testId="stat-technical-score" />
        <Stat label="Communication score" value={<span className={scoreColor(ov?.communication_score)}>{fmt(ov?.communication_score)}</span>} testId="stat-communication-score" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow>Progress</Eyebrow>
            <div className="flex gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-400" /> Job readiness</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /> Communication</span>
            </div>
          </div>
          {ov && ov.progress.length > 0 ? (
            <div className="h-56" data-testid="dashboard-progress-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ov.progress.map((p) => ({ name: `#${p.n}`, tech: p.technical, comm: p.communication, decision: p.decision }))}>
                  <CartesianGrid stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "#0B111E", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="tech" name="Job readiness" stroke="#38BDF8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="comm" name="Communication" stroke="#34D399" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState testId="dashboard-progress-empty" title={isError ? "Stats unavailable right now" : "No completed interviews yet"} desc="Complete your first interview to start tracking job readiness and communication over time." />
          )}
        </Panel>
        <div className="grid gap-6">
          <Panel>
            <Eyebrow>Strongest skills</Eyebrow>
            <div className="mt-3 space-y-3">
              {ov?.strongest.length ? ov.strongest.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-1.5 text-slate-300"><TrendingUp className="size-3.5 text-emerald-400" />{s.name}</span><span className="font-mono text-slate-400">{Math.round(s.score)}</span></div>
                  <Bar value={s.score} />
                </div>
              )) : <div className="text-sm text-slate-500" data-testid="dashboard-strongest-empty">Appears after your first interview.</div>}
            </div>
          </Panel>
          <Panel>
            <Eyebrow>Weakest skills</Eyebrow>
            <div className="mt-3 space-y-3">
              {ov?.weakest.length ? ov.weakest.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-1.5 text-slate-300"><TrendingDown className="size-3.5 text-amber-400" />{s.name}</span><span className="font-mono text-slate-400">{Math.round(s.score)}</span></div>
                  <Bar value={s.score} />
                </div>
              )) : <div className="text-sm text-slate-500">Appears once enough skills are measured.</div>}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Recent interviews</Eyebrow>
            <Link to="/history" className="text-xs text-sky-400 hover:underline" data-testid="dashboard-view-history">View all</Link>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {ov?.recent.length ? ov.recent.map((r) => (
              <Link
                key={r.id}
                to={r.status === "completed" || r.status === "evaluating" || r.status === "failed" ? `/interview/${r.id}/report` : `/interview/${r.id}/lobby`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-white/[0.02]"
                data-testid={`recent-interview-${r.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{r.company_name} · {r.position}</div>
                  <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()} · {fmtDuration(r.duration_seconds)}</div>
                </div>
                <DecisionBadge decision={r.decision ?? (r.status === "completed" ? null : r.status.toUpperCase().replace("_", " "))} />
                <ArrowRight className="size-4 text-slate-600" />
              </Link>
            )) : <div className="py-4 text-sm text-slate-500">No interviews yet.</div>}
          </div>
        </Panel>
        <Panel>
          <Eyebrow>Your development plan</Eyebrow>
          {ov?.priorities.length ? (
            <ol className="mt-3 space-y-3 text-sm" data-testid="dashboard-priorities">
              {ov.priorities.map((p, i) => (
                <li key={p.title} className="flex items-start gap-3">
                  <span className="font-heading text-slate-600">{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-slate-200">{p.title}</div>
                    {MODULE_INFO[p.module] && <Link to={MODULE_INFO[p.module].path} className="text-xs text-sky-400 hover:underline">{MODULE_INFO[p.module].title} →</Link>}
                  </div>
                  <StartDrillButton size="xs" title={p.title} why={p.why} module={p.module} testId={`dashboard-priority-drill-${i}`} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Your top 5 priorities appear after your first full evaluation.</p>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
