import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Clock } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Interview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eyebrow, Panel } from "@/components/common";
import { cn } from "@/lib/utils";

export default function Waiting() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: iv } = useQuery({ queryKey: ["interview", id], queryFn: () => apiGet<Interview>(`/interviews/${id}`) });
  if (!iv) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-sky-400" />
      </div>
    );
  }
  const prev = iv.rounds[iv.current_round - 1];
  const next = iv.rounds[iv.current_round];
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl anim-fade-up">
        {prev && (
          <div className="mb-8 flex items-center gap-2 text-emerald-300" data-testid="waiting-prev-complete">
            <CheckCircle2 className="size-5" />
            <span className="font-mono text-xs tracking-[0.18em] uppercase">{prev.label} completed</span>
          </div>
        )}
        <Eyebrow>Your next interview is with</Eyebrow>
        <Panel className="mt-4 flex items-center gap-5 p-6" data-testid="waiting-next-interviewer">
          <img src={next.persona.image_url} alt={next.persona.name} className="size-20 rounded-2xl object-cover object-top" />
          <div>
            <div className="font-heading text-2xl font-semibold text-white" data-testid="waiting-next-name">{next.persona.name}</div>
            <div className="text-sm text-slate-400">{next.persona.title} · {iv.company.name}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-slate-300">
              Round {next.index + 1} of {iv.rounds.length} · {next.label}
            </div>
          </div>
        </Panel>
        <div className="mt-6 flex gap-1.5">
          {iv.rounds.map((r) => (
            <div key={r.index} className={cn("h-1 flex-1 rounded-full", r.status === "completed" ? "bg-emerald-400" : r.index === next.index ? "bg-sky-400" : "bg-white/10")} />
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <Clock className="size-4" /> Take a breath, grab some water, and join when you're ready.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" className="h-11 px-6" onClick={() => nav(`/interview/${id}/room`)} data-testid="waiting-join-button">
            JOIN WHEN READY
          </Button>
          <Button size="lg" variant="ghost" className="h-11" onClick={() => nav("/")} data-testid="waiting-later-button">
            Continue later
          </Button>
        </div>
      </div>
    </div>
  );
}
