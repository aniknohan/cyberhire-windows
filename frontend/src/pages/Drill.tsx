import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Timer, Volume2, Zap, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useSpeaker } from "@/lib/audio";
import { handleUpgradeError } from "@/lib/billing";
import type { Drill, PracticeResult } from "@/lib/types";
import { MODULE_INFO, scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import { Eyebrow, Panel } from "@/components/common";
import { AnswerCapture } from "@/components/AnswerCapture";
import { Button, buttonVariants } from "@/components/ui/button";
import { ResultCard } from "@/pages/Practice";

/** One-tap button that turns a report priority into a 10-minute drill. */
export function StartDrillButton({ title, why, module, testId, size = "sm" }: { title: string; why: string; module: string; testId: string; size?: "sm" | "xs" }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => apiPost<Drill>("/practice/drills", { title, why, module }),
    onSuccess: (d) => {
      qc.setQueryData(["drill", d.id], d);
      qc.invalidateQueries({ queryKey: ["drills"] });
      nav(`/practice/drill/${d.id}`);
    },
    onError: (e) => handleUpgradeError(e, nav) || toast.error("Couldn't build the drill. Please try again."),
  });
  return (
    <Button size={size} onClick={() => m.mutate()} disabled={m.isPending} data-testid={testId}>
      {m.isPending ? <Loader2 className="animate-spin" /> : <Zap />} {m.isPending ? "Building drill…" : "10-min drill"}
    </Button>
  );
}

const score = (r: { pronunciation_score: number | null; communication_score: number }) => Math.round(r.pronunciation_score ?? r.communication_score);

export default function DrillPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const speaker = useSpeaker();
  const { data: drill } = useQuery({ queryKey: ["drill", id], queryFn: () => apiGet<Drill>(`/practice/drills/${id}`) });
  const [step, setStep] = useState<number | null>(null);
  const [last, setLast] = useState<PracticeResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (drill && step === null) {
      const done = new Set(drill.results.map((r) => r.index));
      const next = drill.items.findIndex((_, i) => !done.has(i));
      setStep(next === -1 ? drill.items.length : next);
    }
  }, [drill, step]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const answer = useMutation({
    mutationFn: (b: { audio_b64?: string; mime?: string; text?: string }) => apiPost<PracticeResult>(`/practice/drills/${id}/items/${step}`, b),
    onSuccess: (r) => {
      setLast(r);
      qc.invalidateQueries({ queryKey: ["drill", id] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? String((e.body as { detail?: string })?.detail ?? "Evaluation failed") : "Evaluation failed"),
  });

  if (!drill || step === null) {
    return <AppShell><Loader2 className="size-6 animate-spin text-sky-400" /></AppShell>;
  }
  const remaining = Math.max(0, drill.minutes * 60 - (startedAt ? (now - startedAt) / 1000 : 0));
  const item = drill.items[step];
  const finished = step >= drill.items.length;
  const avg = drill.results.length ? Math.round(drill.results.reduce((a, r) => a + score(r), 0) / drill.results.length) : null;
  const sayText = item ? (item.module === "pronunciation" ? item.prompt : `${item.prompt}${item.audience ? ` Explain it to a ${item.audience}.` : ""}`) : "";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow className="text-sky-400/80">10-minute drill</Eyebrow>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white" data-testid="drill-title">{drill.title}</h1>
            {drill.why && <p className="mt-1 max-w-xl text-sm text-slate-400">{drill.why}</p>}
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-lg", remaining < 60 && startedAt ? "border-amber-400/40 text-amber-300" : "border-white/10 text-white")} data-testid="drill-timer">
            <Timer className="size-4" />
            {Math.floor(remaining / 60)}:{String(Math.floor(remaining % 60)).padStart(2, "0")}
          </div>
        </div>
        <div className="flex gap-1.5">
          {drill.items.map((it, i) => {
            const r = drill.results.find((x) => x.index === i);
            return <div key={`${it.module}-${it.prompt}`} className={cn("h-1.5 flex-1 rounded-full", r ? "bg-emerald-400" : i === step ? "bg-sky-400" : "bg-white/10")} data-testid={`drill-progress-${i}`} />;
          })}
        </div>

        {finished ? (
          <Panel className="space-y-4" data-testid="drill-summary">
            <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="size-5" /> Drill complete</div>
            <div className="font-heading text-4xl text-white">Average {avg ?? "—"}</div>
            <div className="divide-y divide-white/[0.05]">
              {drill.items.map((it, i) => {
                const r = drill.results.find((x) => x.index === i);
                return (
                  <div key={`${it.module}-${it.prompt}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{MODULE_INFO[it.module]?.title ?? it.module}</span>
                    <span className="flex-1 truncate text-slate-300">{it.prompt}</span>
                    <span className={cn("font-mono", scoreColor(r ? score(r) : null))}>{r ? score(r) : "—"}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Link to="/interview/new" className={buttonVariants()} data-testid="drill-start-interview">Test it in an interview <ArrowRight /></Link>
              <Link to="/practice" className={buttonVariants({ variant: "secondary" })} data-testid="drill-back-practice">Back to practice</Link>
            </div>
          </Panel>
        ) : (
          <Panel className="space-y-5" data-testid={`drill-item-${step}`}>
            <div className="flex items-center justify-between">
              <Eyebrow>Exercise {step + 1} of {drill.items.length} · {MODULE_INFO[item.module]?.title ?? item.module}</Eyebrow>
              <Button size="xs" variant="secondary" onClick={() => speaker.speak(sayText, "p-jessica")} data-testid="drill-listen"><Volume2 /> Listen</Button>
            </div>
            <div className={cn("font-heading text-white", item.module === "pronunciation" ? "text-4xl font-semibold" : "text-2xl")} data-testid="drill-prompt">
              {item.prompt}
              {item.audience && <span className="text-sky-300"> Explain it to a {item.audience}.</span>}
            </div>
            {item.focus && <p className="text-xs text-slate-500">Focus: {item.focus}</p>}
            {!last && (
              <div onClickCapture={() => !startedAt && setStartedAt(Date.now())}>
                <AnswerCapture onSubmit={(b) => answer.mutate(b)} busy={answer.isPending} testId="drill-capture" />
              </div>
            )}
          </Panel>
        )}

        {last && !finished && (
          <>
            <ResultCard r={last} />
            <Button
              size="lg"
              onClick={() => {
                setLast(null);
                setStep((s) => (s ?? 0) + 1);
              }}
              data-testid="drill-next-button"
            >
              {step + 1 < drill.items.length ? "Next exercise" : "See drill summary"} <ArrowRight />
            </Button>
          </>
        )}
      </div>
    </AppShell>
  );
}
