import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Volume2, Zap, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { handleUpgradeError } from "@/lib/billing";
import { useSpeaker } from "@/lib/audio";
import type { Drill, PracticeResult } from "@/lib/types";
import { AUDIENCES, MODULE_INFO, PRACTICE_PROMPTS, scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Eyebrow, Panel } from "@/components/common";
import { AnswerCapture } from "@/components/AnswerCapture";
import { Button, buttonVariants } from "@/components/ui/button";

const MODULES = ["tell_me_about_yourself", "behavioral_star", "technical_explanation", "non_technical_audience", "pronunciation", "rapid_interview"];

export function ResultCard({ r }: { r: PracticeResult }) {
  const speaker = useSpeaker();
  const delta = r.previous_score != null ? (r.pronunciation_score ?? r.communication_score) - r.previous_score : null;
  const fb = r.feedback;
  return (
    <Panel className="space-y-4 anim-fade-up" data-testid="practice-result">
      <div className="flex flex-wrap items-end gap-6">
        {r.pronunciation_score != null ? (
          <div><Eyebrow>Clarity score</Eyebrow><div className={cn("font-heading text-3xl", scoreColor(r.pronunciation_score))} data-testid="practice-pronunciation-score">{Math.round(r.pronunciation_score)}%</div></div>
        ) : (
          <>
            {r.technical_score != null && <div><Eyebrow>Technical</Eyebrow><div className={cn("font-heading text-3xl", scoreColor(r.technical_score))} data-testid="practice-technical-score">{Math.round(r.technical_score)}</div></div>}
            <div><Eyebrow>Communication</Eyebrow><div className={cn("font-heading text-3xl", scoreColor(r.communication_score))} data-testid="practice-communication-score">{Math.round(r.communication_score)}</div></div>
          </>
        )}
        {r.previous_score != null && delta != null && (
          <div className="text-sm" data-testid="practice-improvement">
            <Eyebrow>Previous attempt</Eyebrow>
            <div className="mt-1 text-slate-300">{Math.round(r.previous_score)} → <span className={delta >= 0 ? "text-emerald-300" : "text-red-300"}>{delta >= 0 ? <ArrowUp className="inline size-3.5" /> : <ArrowDown className="inline size-3.5" />} {delta >= 0 ? "Improved" : "Lower"} {Math.abs(Math.round(delta))}</span></div>
          </div>
        )}
        <div className="ml-auto font-mono text-[11px] text-slate-500">
          {r.duration > 0 && <span>{Math.round(r.duration)}s · </span>}
          {r.wpm && <span>{Math.round(r.wpm)} wpm · </span>}
          fillers {Object.values(r.fillers).reduce((a, b) => a + b, 0)}
        </div>
      </div>
      <div>
        <Eyebrow>What we heard</Eyebrow>
        <p className="mt-1 text-sm text-slate-300" data-testid="practice-transcript">"{r.transcript}"</p>
      </div>
      {Object.keys(r.star).length > 0 && (
        <div className="flex gap-2">
          {["situation", "task", "action", "result"].map((k) => (
            <span key={k} className={cn("rounded-md border px-2 py-1 text-xs capitalize", r.star[k] ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300")}>{r.star[k] ? "✓" : "✗"} {k}</span>
          ))}
        </div>
      )}
      {fb && (
        <div className="grid gap-4 md:grid-cols-2">
          <div><Eyebrow>What worked</Eyebrow><ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-300">{fb.did_well.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><Eyebrow>What could improve</Eyebrow><ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-300">{fb.improve.map((x) => <li key={x}>{x}</li>)}</ul></div>
          {fb.grammar.length > 0 && (
            <div className="md:col-span-2 space-y-2">
              <Eyebrow>Grammar & phrasing</Eyebrow>
              {fb.grammar.map((g) => <div key={g.said} className="rounded-md bg-white/[0.02] p-2 text-sm"><span className="text-slate-400">"{g.said}"</span> → <span className="text-emerald-300">"{g.better}"</span> <span className="text-xs text-slate-500">{g.why}</span></div>)}
            </div>
          )}
          {fb.stronger_answer && (
            <div className="md:col-span-2 rounded-lg border border-sky-500/15 bg-sky-500/[0.04] p-3">
              <div className="flex items-center justify-between"><Eyebrow className="text-sky-400/80">Stronger professional version</Eyebrow>
                <Button size="xs" variant="secondary" onClick={() => speaker.speak(fb.stronger_answer, "p-sarah")} data-testid="practice-listen-stronger"><Volume2 /> Listen</Button></div>
              <p className="mt-2 text-sm text-slate-200">{fb.stronger_answer}</p>
            </div>
          )}
        </div>
      )}
      {r.pronunciation_score != null && <p className="text-xs text-slate-500">Score reflects how clearly speech recognition understood the term from your audio — it measures intelligibility, not accent.</p>}
    </Panel>
  );
}

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const module = MODULES.includes(params.get("module") ?? "") ? (params.get("module") as string) : "tell_me_about_yourself";
  const prompts = PRACTICE_PROMPTS[module] ?? [];
  const [promptIdx, setPromptIdx] = useState(0);
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const speaker = useSpeaker();
  const qc = useQueryClient();
  const nav = useNavigate();
  const prompt = prompts[promptIdx % Math.max(1, prompts.length)] ?? "";
  const { data: drills } = useQuery({ queryKey: ["drills"], queryFn: () => apiGet<Drill[]>("/practice/drills") });
  const { data: hist } = useQuery({ queryKey: ["practice-history", module], queryFn: () => apiGet<PracticeResult[]>(`/practice/history?module=${module}`) });
  const evalM = useMutation({
    mutationFn: (b: { audio_b64?: string; mime?: string; text?: string }) =>
      apiPost<PracticeResult>("/practice/evaluate", { module, prompt, audience: module === "non_technical_audience" ? audience : undefined, ...b }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["practice-history", module] });
    },
    onError: (e) => handleUpgradeError(e, nav) || toast.error(e instanceof ApiError ? String((e.body as { detail?: string })?.detail ?? "Evaluation failed") : "Evaluation failed"),
  });
  const pick = (m: string) => {
    setParams({ module: m });
    setPromptIdx(0);
    setResult(null);
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Communication practice" title="Practice modules" desc="Short, focused drills. Answer out loud — you'll get grammar, clarity, structure and a stronger professional version." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="flex gap-2 overflow-x-auto lg:flex-col">
          {MODULES.map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              data-testid={`practice-module-${m}`}
              className={cn("shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150", module === m ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.03]")}
            >
              {MODULE_INFO[m].title}
            </button>
          ))}
          {drills && drills.length > 0 && (
            <div className="hidden pt-4 lg:block" data-testid="practice-drills-list">
              <Eyebrow className="px-3">Your drills</Eyebrow>
              {drills.slice(0, 6).map((d) => (
                <Link key={d.id} to={`/practice/drill/${d.id}`} className="mt-1 block truncate rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/[0.03] hover:text-slate-200" data-testid={`practice-drill-link-${d.id}`}>
                  {d.completed ? "✓ " : "• "}{d.title}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          {module === "rapid_interview" ? (
            <Panel className="space-y-4" data-testid="practice-rapid">
              <div className="flex items-center gap-2 text-white"><Zap className="size-5 text-amber-400" /> <span className="font-heading text-xl">Rapid Interview</span></div>
              <p className="text-sm text-slate-400">A short, high-pressure video interview: harder questions, faster follow-ups, and two compact rounds (technical + live investigation) — around 10 minutes.</p>
              <Link to="/interview/new?mode=quick&difficulty=Hard%20Mode" className={buttonVariants()} data-testid="practice-start-rapid">Start rapid interview</Link>
            </Panel>
          ) : (
            <Panel className="space-y-5">
              {module === "pronunciation" ? (
                <div>
                  <Eyebrow>Say this term clearly</Eyebrow>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prompts.map((p, i) => (
                      <button key={p} onClick={() => { setPromptIdx(i); setResult(null); }} className={cn("rounded-md border px-2.5 py-1 text-sm transition-colors", i === promptIdx ? "border-sky-500/60 bg-sky-500/10 text-white" : "border-white/10 text-slate-400 hover:text-slate-200")} data-testid={`pron-term-${p.toLowerCase()}`}>{p}</button>
                    ))}
                  </div>
                  <div className="mt-6 font-heading text-4xl font-semibold text-white" data-testid="practice-prompt">{prompt}</div>
                </div>
              ) : (
                <div>
                  <Eyebrow>Interviewer asks</Eyebrow>
                  <div className="mt-2 font-heading text-2xl text-white" data-testid="practice-prompt">
                    {prompt}
                    {module === "non_technical_audience" && <span className="text-sky-300"> Explain it to a {audience}.</span>}
                  </div>
                  {module === "non_technical_audience" && (
                    <div className="mt-3 flex gap-2">
                      {AUDIENCES.map((a) => (
                        <button key={a} onClick={() => { setAudience(a); setResult(null); }} className={cn("rounded-md border px-2.5 py-1 text-xs", a === audience ? "border-sky-500/60 bg-sky-500/10 text-white" : "border-white/10 text-slate-400")} data-testid={`audience-${a.split(" ")[0].toLowerCase()}`}>{a}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => speaker.speak(module === "pronunciation" ? prompt : prompt + (module === "non_technical_audience" ? ` Explain it to a ${audience}.` : ""), "p-jessica")} data-testid="practice-listen">
                  <Volume2 /> Listen
                </Button>
                {module !== "pronunciation" && prompts.length > 1 && (
                  <Button variant="ghost" onClick={() => { setPromptIdx((i) => i + 1); setResult(null); }} data-testid="practice-next-prompt">Next prompt</Button>
                )}
              </div>
              <AnswerCapture onSubmit={(b) => evalM.mutate(b)} busy={evalM.isPending} testId="practice-capture" />
            </Panel>
          )}
          {result && <ResultCard r={result} />}
          {hist && hist.length > 0 && module !== "rapid_interview" && (
            <Panel>
              <Eyebrow>Recent attempts</Eyebrow>
              <div className="mt-3 divide-y divide-white/[0.05]">
                {hist.slice(0, 8).map((h) => (
                  <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 truncate text-slate-300">{h.prompt}</span>
                    <span className="text-xs text-slate-500">{new Date(h.created_at).toLocaleDateString()}</span>
                    <span className={cn("w-10 text-right font-mono", scoreColor(h.pronunciation_score ?? h.communication_score))}>{Math.round(h.pronunciation_score ?? h.communication_score)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
