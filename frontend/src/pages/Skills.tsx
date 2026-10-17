import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import type { CommStats, TechStats } from "@/lib/types";
import { scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Bar, EmptyState, Eyebrow, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";

const tip = { background: "#0B111E", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 };

function Spark({ series }: { series: (number | null)[] }) {
  const data = series.map((v, i) => ({ i, v }));
  if (data.filter((d) => d.v != null).length < 2) return <div className="h-8 text-[11px] text-slate-600">Needs 2+ interviews</div>;
  return (
    <div className="h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke="#38BDF8" strokeWidth={1.5} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CommunicationSkills() {
  const { data } = useQuery({ queryKey: ["comm-stats"], queryFn: () => apiGet<CommStats>("/stats/communication") });
  const empty = !data || data.labels.length === 0;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Professional communication"
        title="Communication skills"
        desc="How clearly, confidently and professionally you explain what you know. Measured separately from technical knowledge. Accents are never penalized."
        action={<Link to="/practice" className={buttonVariants({ variant: "secondary" })} data-testid="comm-go-practice">Practice modules</Link>}
      />
      {empty ? (
        <EmptyState testId="comm-empty" title="No communication data yet" desc="Complete an interview to see grammar, fluency, pace, filler words and more." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.dims.map((d) => (
              <Panel key={d.key} className="p-4" data-testid={`comm-dim-${d.key}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-300">{d.label}</span>
                  <span className={cn("font-heading text-xl", scoreColor(d.current))}>{d.current != null ? Math.round(d.current) : "—"}</span>
                </div>
                <Bar value={d.current} className="mt-2" />
                <div className="mt-3"><Spark series={d.series} /></div>
              </Panel>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <Eyebrow>Filler words per interview</Eyebrow>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.labels.map((l, i) => ({ l, v: data.filler_series[i] }))}>
                    <CartesianGrid stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="l" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={tip} />
                    <Area type="monotone" dataKey="v" name="Fillers" stroke="#FBBF24" fill="#FBBF24" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(data.filler_breakdown).sort((a, b) => b[1] - a[1]).map(([w, n]) => (
                  <span key={w} className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-300">"{w}" × {n}</span>
                ))}
              </div>
            </Panel>
            <Panel>
              <Eyebrow>Speaking pace (words per minute)</Eyebrow>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.labels.map((l, i) => ({ l, v: data.wpm_series[i] }))}>
                    <CartesianGrid stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="l" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={32} />
                    <Tooltip contentStyle={tip} />
                    <Line type="monotone" dataKey="v" name="WPM" stroke="#34D399" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-slate-500">There's no single correct speed — around 120–165 wpm is usually easy to follow in interviews. {data.practice_count} practice sessions completed.</p>
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}

const TOPIC_MODULE: Record<string, string> = { Phishing: "technical_explanation", "Active Directory": "technical_explanation" };

export function TechnicalSkills() {
  const { data } = useQuery({ queryKey: ["tech-stats"], queryFn: () => apiGet<TechStats>("/stats/technical") });
  const any = data?.topics.some((t) => t.answered > 0);
  return (
    <AppShell>
      <PageHeader eyebrow="Job readiness" title="Technical skills" desc="Your technical knowledge by domain, built from every scored interview answer." />
      {!any && <div className="mb-6"><EmptyState testId="tech-empty" title="No technical answers scored yet" desc="Complete a Technical or Full interview to populate this view." /></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data?.topics.map((t) => (
          <Panel key={t.topic} className={cn("p-4", t.weak && "border-amber-400/25")} data-testid={`tech-topic-${t.topic.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-200">{t.topic}</span>
              <span className={cn("font-heading text-xl", scoreColor(t.current))}>{t.current != null ? Math.round(t.current) : "—"}</span>
            </div>
            <Bar value={t.current} className="mt-2" />
            <div className="mt-2 flex justify-between text-[11px] text-slate-500">
              <span>{t.answered} answered</span>
              {t.trend != null && <span className={t.trend >= 0 ? "text-emerald-400" : "text-red-400"}>{t.trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(t.trend))}</span>}
            </div>
            {t.weak && (
              <div className="mt-3 border-t border-white/[0.05] pt-2 text-[11px] text-amber-200/80">
                Weak topic{t.missing.length ? ` — review: ${t.missing.slice(0, 2).join(", ")}` : ""}
                <Link to={`/practice?module=${TOPIC_MODULE[t.topic] ?? "technical_explanation"}`} className="mt-1 block text-sky-400 hover:underline">Recommended practice →</Link>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
