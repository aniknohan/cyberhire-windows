import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, RotateCcw, Play, Trash2, ChevronDown, AlertTriangle, ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { b64ToUrl, useSpeaker } from "@/lib/audio";
import type { AudioOut, Interview, ResponseOut, RetryResult } from "@/lib/types";
import { COMM_LABELS, MODULE_INFO, fmtDuration, scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell from "@/components/AppShell";
import { Bar, Eyebrow, Panel, ScoreRing } from "@/components/common";
import { AnswerCapture } from "@/components/AnswerCapture";
import { StartDrillButton } from "@/pages/Drill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ReviewItem({ r, iv }: { r: ResponseOut; iv: Interview }) {
  const [open, setOpen] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [retries, setRetries] = useState<RetryResult[]>(r.retries);
  const speaker = useSpeaker();
  const persona = iv.rounds[r.round_index]?.persona;
  const e = r.evaluation;
  const retry = useMutation({
    mutationFn: (body: { audio_b64?: string; mime?: string; text?: string }) => apiPost<RetryResult>(`/responses/${r.id}/retry`, body),
    onSuccess: (res) => {
      setRetries((x) => [...x, res]);
      setPracticing(false);
    },
    onError: () => toast.error("Couldn't evaluate your retry. Please try again."),
  });
  const playMine = async () => {
    try {
      const a = await apiGet<AudioOut>(`/responses/${r.id}/audio`);
      void new Audio(b64ToUrl(a.audio_b64, a.mime)).play();
    } catch {
      toast.error("Recording not available");
    }
  };
  const last = retries[retries.length - 1];
  return (
    <Panel className="p-0" data-testid={`review-item-${r.id}`}>
      <button className="flex w-full items-start gap-4 p-4 text-left" onClick={() => setOpen((o) => !o)} data-testid={`review-toggle-${r.id}`}>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[11px] text-slate-500">
            {r.interviewer_name} · {iv.rounds[r.round_index]?.label}
          </div>
          <div className="text-sm text-slate-100">{r.question}</div>
        </div>
        {e && e.evaluable ? (
          <div className="flex shrink-0 gap-4 text-right">
            <div><div className="text-[10px] uppercase text-slate-500">Tech</div><div className={cn("font-heading text-lg", scoreColor(e.technical_score))}>{Math.round(e.technical_score)}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Comm</div><div className={cn("font-heading text-lg", scoreColor(e.communication_score))}>{Math.round(e.communication_score)}</div></div>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-slate-500">{e ? "not scored" : "pending"}</span>
        )}
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-slate-500 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-5 border-t border-white/[0.06] p-4 text-sm anim-fade-up">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => speaker.speak(r.question, persona?.id)} data-testid={`review-replay-question-${r.id}`}>
              <Play /> Replay question
            </Button>
            {r.has_audio && (
              <Button size="sm" variant="secondary" onClick={playMine} data-testid={`review-play-my-answer-${r.id}`}>
                <Volume2 /> My answer audio
              </Button>
            )}
            {e?.stronger_answer && (
              <Button size="sm" variant="secondary" onClick={() => speaker.speak(e.stronger_answer, persona?.id)} data-testid={`review-listen-stronger-${r.id}`}>
                <Volume2 /> Listen to stronger answer
              </Button>
            )}
            <Button size="sm" onClick={() => setPracticing((p) => !p)} data-testid={`review-practice-again-${r.id}`}>
              <RotateCcw /> Practice again
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Eyebrow>What you said</Eyebrow>
              <p className="mt-2 leading-relaxed text-slate-300" data-testid={`review-transcript-${r.id}`}>{r.transcript}</p>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-slate-500">
                {r.duration > 0 && <span>{fmtDuration(r.duration)}</span>}
                {r.wpm && <span>{Math.round(r.wpm)} wpm</span>}
                {r.clarity != null && <span>clarity {Math.round(r.clarity)}</span>}
                <span>fillers {Object.values(r.fillers).reduce((a, b) => a + b, 0)}</span>
              </div>
            </div>
            {e?.stronger_answer && (
              <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] p-3">
                <Eyebrow className="text-sky-400/80">Stronger professional version</Eyebrow>
                <p className="mt-2 leading-relaxed text-slate-200">{e.stronger_answer}</p>
              </div>
            )}
          </div>
          {e && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Eyebrow>What worked</Eyebrow>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-300">{e.did_well.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div>
                  <Eyebrow>What could improve</Eyebrow>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-300">{e.improve.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              </div>
              {e.grammar.length > 0 && (
                <div>
                  <Eyebrow>Grammar & phrasing</Eyebrow>
                  <div className="mt-2 space-y-2">
                    {e.grammar.map((g) => (
                      <div key={g.said} className="rounded-lg bg-white/[0.02] p-3">
                        <div className="text-slate-400">"{g.said}"</div>
                        <div className="mt-1 text-emerald-300">More natural: "{g.better}"</div>
                        {g.why && <div className="mt-1 text-xs text-slate-500">{g.why}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Pronunciation", e.pronunciation_note],
                  ["Fluency", e.fluency_note],
                  ["Confidence", e.confidence_note],
                  ["Answer structure", e.structure_note],
                  ["Conciseness", e.conciseness_note],
                  ["Technical communication", `${Math.round(e.technical_communication)}/100`],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-white/[0.05] p-3">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                      <div className="text-slate-300">{v}</div>
                    </div>
                  ))}
              </div>
              {(e.missing_concepts.length > 0 || e.study_topics.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {e.missing_concepts.map((m) => <span key={m} className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-0.5 text-[11px] text-amber-200">missing: {m}</span>)}
                  {e.study_topics.map((m) => <span key={m} className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">study: {m}</span>)}
                </div>
              )}
            </>
          )}
          {practicing && (
            <div className="rounded-lg border border-white/[0.08] p-4">
              <div className="mb-3 text-slate-300">Answer the question again.</div>
              <AnswerCapture onSubmit={(b) => retry.mutate(b)} busy={retry.isPending} testId={`review-retry-capture-${r.id}`} />
            </div>
          )}
          {last && e && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03] p-4" data-testid={`review-retry-result-${r.id}`}>
              <div><Eyebrow>Original</Eyebrow><div className="mt-1 text-slate-300">Tech {Math.round(e.technical_score)} · Comm {Math.round(e.communication_score)}</div></div>
              <div><Eyebrow>Retry</Eyebrow><div className="mt-1 text-slate-200">Tech {Math.round(last.technical_score)} · Comm {Math.round(last.communication_score)}</div></div>
              <div>
                <Eyebrow>Improvement</Eyebrow>
                <div className="mt-1 font-mono">
                  {[["Technical", last.technical_score - e.technical_score], ["Communication", last.communication_score - e.communication_score]].map(([k, d]) => (
                    <div key={k as string} className={(d as number) >= 0 ? "text-emerald-300" : "text-red-300"}>
                      {(d as number) >= 0 ? "+" : ""}{Math.round(d as number)} {k}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: iv } = useQuery({
    queryKey: ["interview", id],
    queryFn: () => apiGet<Interview>(`/interviews/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "evaluating" ? 3000 : false),
  });
  const done = iv?.status === "completed";
  const { data: responses } = useQuery({
    queryKey: ["responses", id, done],
    queryFn: () => apiGet<ResponseOut[]>(`/interviews/${id}/responses`),
    enabled: !!iv,
  });
  const refinal = useMutation({
    mutationFn: () => apiPost<Interview>(`/interviews/${id}/finalize`),
    onSuccess: (d) => qc.setQueryData(["interview", id], d),
  });
  const delRec = useMutation({
    mutationFn: () => apiDelete(`/interviews/${id}/recordings`),
    onSuccess: () => {
      toast.success("Recordings deleted");
      qc.invalidateQueries({ queryKey: ["responses", id] });
    },
  });
  const rep = iv?.report;

  const exportMd = () => {
    if (!iv || !rep) return;
    const md = [
      `# ${iv.position} — ${iv.company.name}`,
      `Decision: ${rep.decision}`,
      `Job readiness: ${rep.job_readiness}/100 · Communication: ${rep.communication}/100`,
      `\n## Why\n${rep.decision_reasoning}`,
      `\n## Strengths\n${rep.strengths.map((s) => `- ${s}`).join("\n")}`,
      `\n## Weaknesses\n${rep.weaknesses.map((s) => `- ${s}`).join("\n")}`,
      `\n## Hiring manager summary\n${rep.hiring_summary}`,
      `\n## Top 5 priorities\n${rep.priorities.map((p, i) => `${i + 1}. ${p.title} — ${p.why}`).join("\n")}`,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `interview-report-${iv.company.name.replace(/\s+/g, "-")}.md`;
    a.click();
  };

  return (
    <AppShell>
      {!iv ? (
        <Loader2 className="size-6 animate-spin text-sky-400" />
      ) : iv.status === "evaluating" || (iv.status !== "completed" && iv.status !== "failed") ? (
        <div className="mx-auto max-w-lg py-16 text-center" data-testid="report-evaluating">
          <Loader2 className="mx-auto size-8 animate-spin text-sky-400" />
          <h1 className="mt-6 font-heading text-2xl font-semibold text-white">The hiring team is reviewing your interview</h1>
          <p className="mt-2 text-sm text-slate-400">Scoring every answer for job readiness and communication, then making a hiring decision. This usually takes under a minute.</p>
          <div className="mt-8 space-y-2 text-left">
            {iv.rounds.map((r) => (
              <div key={r.index} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-4 py-2 text-sm">
                <span className="text-slate-300">{r.label}</span>
                <span className="text-xs text-slate-500">{r.status !== "completed" ? "skipped" : r.evaluating ? "evaluating…" : "reviewed"}</span>
              </div>
            ))}
          </div>
          {iv.status === "in_progress" && (
            <Button className="mt-6" onClick={() => nav(`/interview/${id}/room`)} data-testid="report-resume-interview">Resume interview</Button>
          )}
        </div>
      ) : iv.status === "failed" || !rep ? (
        <Panel className="mx-auto max-w-lg text-center" data-testid="report-failed">
          <AlertTriangle className="mx-auto size-6 text-amber-400" />
          <div className="mt-3 text-white">We couldn't finish evaluating this interview.</div>
          <Button className="mt-4" onClick={() => refinal.mutate()} disabled={refinal.isPending} data-testid="report-retry-evaluation">Try again</Button>
        </Panel>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Eyebrow>Final decision · {iv.position}</Eyebrow>
              <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl" data-testid="report-decision">{rep.decision}</h1>
              <div className="mt-2 text-sm text-slate-400">
                {iv.company.name} · {iv.company.industry} · {new Date(iv.created_at).toLocaleDateString()} · {fmtDuration(iv.duration_seconds)} in meetings
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportMd} data-testid="report-export"><Download /> Export</Button>
              {iv.record_audio && (
                <Button variant="ghost" onClick={() => delRec.mutate()} data-testid="report-delete-recordings"><Trash2 /> Delete recordings</Button>
              )}
              <Link to="/interview/new" className={buttonVariants()} data-testid="report-new-interview">New interview <ArrowRight /></Link>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[auto_auto_1fr]">
            <Panel className="flex flex-col items-center gap-2 px-8">
              <ScoreRing value={rep.job_readiness} testId="report-job-readiness" />
              <Eyebrow>Job readiness</Eyebrow>
            </Panel>
            <Panel className="flex flex-col items-center gap-2 px-8">
              <ScoreRing value={rep.communication} testId="report-communication" />
              <Eyebrow>Communication</Eyebrow>
            </Panel>
            <Panel>
              <Eyebrow>Round results</Eyebrow>
              <div className="mt-3 space-y-3">
                {rep.round_scores.map((s) => (
                  <div key={s.label} className="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-sm">
                    <span className="text-slate-300">{s.label}</span>
                    <Bar value={s.score} />
                    <span className={cn("text-right font-mono", scoreColor(s.score))}>{s.score == null ? "—" : Math.round(s.score)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-3 text-xs text-slate-400 sm:grid-cols-4">
                <div>Technical knowledge<div className={cn("font-heading text-lg", scoreColor(rep.technical_avg))}>{rep.technical_avg ?? "—"}</div></div>
                <div>Technical communication<div className={cn("font-heading text-lg", scoreColor(rep.technical_communication_avg))}>{rep.technical_communication_avg ?? "—"}</div></div>
                <div>Filler words<div className="font-heading text-lg text-white" data-testid="report-filler-total">{rep.filler_total}{rep.filler_top ? <span className="ml-1 text-xs text-slate-500">mostly "{rep.filler_top}"</span> : null}</div></div>
                <div>Speaking pace<div className="font-heading text-lg text-white">{rep.avg_wpm ? `${Math.round(rep.avg_wpm)} wpm` : "—"}</div></div>
              </div>
            </Panel>
          </div>

          <Tabs defaultValue="decision">
            <TabsList variant="line">
              <TabsTrigger value="decision" data-testid="report-tab-decision">Decision</TabsTrigger>
              <TabsTrigger value="review" data-testid="report-tab-review">Question review ({responses?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="communication" data-testid="report-tab-communication">Communication</TabsTrigger>
            </TabsList>
            <TabsContent value="decision" className="mt-6 space-y-4">
              <Panel>
                <Eyebrow>Why you were {rep.decision === "NO HIRE" ? "not " : ""}{rep.decision === "BORDERLINE" ? "flagged for another interview" : "hired"}</Eyebrow>
                <p className="mt-3 leading-relaxed text-slate-300" data-testid="report-reasoning">{rep.decision_reasoning}</p>
              </Panel>
              <div className="grid gap-4 md:grid-cols-2">
                <Panel>
                  <Eyebrow className="text-emerald-400/80">Strengths</Eyebrow>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">{rep.strengths.map((s) => <li key={s} className="flex gap-2"><span className="text-emerald-400">+</span>{s}</li>)}</ul>
                </Panel>
                <Panel>
                  <Eyebrow className="text-amber-400/80">Weaknesses</Eyebrow>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">{rep.weaknesses.map((s) => <li key={s} className="flex gap-2"><span className="text-amber-400">–</span>{s}</li>)}</ul>
                </Panel>
              </div>
              <Panel>
                <Eyebrow>Hiring manager summary</Eyebrow>
                <p className="mt-3 border-l-2 border-sky-500/40 pl-4 leading-relaxed text-slate-300 italic" data-testid="report-hiring-summary">{rep.hiring_summary}</p>
              </Panel>
              <Panel>
                <Eyebrow>Your top 5 priorities</Eyebrow>
                <ol className="mt-3 space-y-3">
                  {rep.priorities.map((p, i) => (
                    <li key={p.title} className="flex items-start gap-4" data-testid={`report-priority-${i}`}>
                      <span className="font-heading text-xl text-slate-600">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{p.title}</div>
                        <div className="text-xs text-slate-400">{p.why}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <StartDrillButton title={p.title} why={p.why} module={p.module} testId={`report-priority-drill-${i}`} />
                        {MODULE_INFO[p.module] && (
                          <Link to={MODULE_INFO[p.module].path} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                            {MODULE_INFO[p.module].title}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            </TabsContent>
            <TabsContent value="review" className="mt-6 space-y-3">
              {responses?.map((r) => <ReviewItem key={r.id} r={r} iv={iv} />)}
              {responses?.length === 0 && <div className="text-sm text-slate-500">No answers were recorded.</div>}
            </TabsContent>
            <TabsContent value="communication" className="mt-6">
              <Panel>
                <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  {Object.entries(COMM_LABELS).map(([k, label]) => (
                    <div key={k}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="text-slate-300">{label}</span>
                        <span className={cn("font-mono", scoreColor(rep.comm_dims[k]))}>{rep.comm_dims[k] != null ? Math.round(rep.comm_dims[k]) : "—"}</span>
                      </div>
                      <Bar value={rep.comm_dims[k]} />
                    </div>
                  ))}
                </div>
                {Object.keys(rep.filler_breakdown).length > 0 && (
                  <div className="mt-6 border-t border-white/[0.05] pt-4">
                    <Eyebrow>Filler words used</Eyebrow>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(rep.filler_breakdown).sort((a, b) => b[1] - a[1]).map(([w, n]) => (
                        <span key={w} className="rounded-md border border-white/10 px-2 py-1 font-mono text-xs text-slate-300">"{w}" × {n}</span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs text-slate-500">Pronunciation clarity is measured from your audio by how reliably speech recognition understood you — accents are never penalized.</p>
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}
