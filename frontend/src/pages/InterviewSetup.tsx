import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Users, Server, Target, GraduationCap, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { handleUpgradeError } from "@/lib/billing";
import type { Interview, InterviewCreate } from "@/lib/types";
import { DIFFICULTY, ENVIRONMENTS, EXPERIENCE, FOCUS_OPTIONS, MODES, POSITIONS, isPentest } from "@/lib/constants";
import { cn } from "@/lib/utils";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Eyebrow, Panel, PositionOptions } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color] duration-150",
        active ? "border-sky-500/60 bg-sky-500/10 text-white" : "border-white/[0.07] bg-white/[0.02] text-slate-300 hover:border-white/20",
      )}
    >
      {children}
    </button>
  );
}

export default function InterviewSetup() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const preset = new URLSearchParams(window.location.search);
  const [cfg, setCfg] = useState<InterviewCreate>({
    position: POSITIONS.includes(me?.target_role ?? "") ? (me?.target_role as string) : "SOC Analyst L1",
    experience: EXPERIENCE.includes(me?.experience_level ?? "") ? (me?.experience_level as string) : "Entry Level",
    difficulty: preset.get("difficulty") || "Realistic / Adaptive",
    environment: "random",
    mode: (preset.get("mode") as InterviewCreate["mode"]) || "full",
    coach_mode: false,
    focus: null,
  });
  const [created, setCreated] = useState<Interview | null>(null);
  const create = useMutation({
    mutationFn: () => apiPost<Interview>("/interviews", cfg),
    onSuccess: (iv) => {
      setCreated(iv);
      qc.setQueryData(["interview", iv.id], iv);
      qc.invalidateQueries({ queryKey: ["interviews"] });
    },
    onError: (e) => handleUpgradeError(e, nav) || toast.error("Couldn't schedule the interview. Please try again."),
  });

  if (created) {
    const c = created.company;
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl anim-fade-up">
          <Eyebrow className="text-sky-400/80">Interview scheduled</Eyebrow>
          <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-white" data-testid="company-name">{c.name}</h1>
          <div className="mt-2 text-slate-400">{c.industry} · {c.employees.toLocaleString()} employees</div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Panel>
              <div className="flex items-center gap-2 text-sm text-slate-300"><Briefcase className="size-4 text-sky-400" /> Position</div>
              <div className="mt-2 font-heading text-lg text-white" data-testid="company-position">{created.position}</div>
              <div className="text-xs text-slate-500">{created.soc_level} · {created.experience} · {created.difficulty}</div>
            </Panel>
            <Panel>
              <div className="flex items-center gap-2 text-sm text-slate-300"><Users className="size-4 text-sky-400" /> Security operations</div>
              <div className="mt-2 text-white">{c.soc_description}</div>
            </Panel>
            <Panel>
              <div className="flex items-center gap-2 text-sm text-slate-300"><Server className="size-4 text-sky-400" /> Environment</div>
              <div className="mt-3 flex flex-wrap gap-1.5" data-testid="company-stack">
                {c.stack.map((s) => <span key={s} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-slate-300">{s}</span>)}
              </div>
            </Panel>
            <Panel>
              <div className="flex items-center gap-2 text-sm text-slate-300"><Target className="size-4 text-sky-400" /> What they care about</div>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">{c.focus.map((f) => <li key={f}>· {f}</li>)}</ul>
            </Panel>
          </div>
          <Panel className="mt-4">
            <Eyebrow>Your interview loop</Eyebrow>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {created.rounds.map((r) => (
                <div key={r.index} className="flex items-center gap-3" data-testid={`loop-round-${r.index}`}>
                  <img src={r.persona.image_url} alt={r.persona.name} className="size-10 rounded-full object-cover object-top" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{r.persona.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{r.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <div className="mt-8 flex gap-3">
            <Button size="lg" className="h-11 px-6" onClick={() => nav(`/interview/${created.id}/lobby`)} data-testid="go-to-lobby-button">
              Go to meeting lobby
            </Button>
            <Button size="lg" variant="ghost" className="h-11" onClick={() => setCreated(null)} data-testid="reconfigure-button">
              Change setup
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Start new interview" title="Configure your interview" desc="Choose the role and environment. We'll generate a fictional company whose security stack shapes the questions you'll get." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select value={cfg.position} onValueChange={(v: string) => setCfg((c) => ({ ...c, position: v }))}>
                <SelectTrigger className="w-full" data-testid="setup-position-select"><SelectValue /></SelectTrigger>
                <SelectContent><PositionOptions /></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Experience level</Label>
              <Select value={cfg.experience} onValueChange={(v: string) => setCfg((c) => ({ ...c, experience: v }))}>
                <SelectTrigger className="w-full" data-testid="setup-experience-select"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPERIENCE.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={cfg.difficulty} onValueChange={(v: string) => setCfg((c) => ({ ...c, difficulty: v }))}>
                <SelectTrigger className="w-full" data-testid="setup-difficulty-select"><SelectValue /></SelectTrigger>
                <SelectContent>{DIFFICULTY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </Panel>
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><Building2 className="size-4 text-sky-400" /> Company environment</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {ENVIRONMENTS.map((e) => (
                <Chip key={e.value} active={cfg.environment === e.value} onClick={() => setCfg((c) => ({ ...c, environment: e.value }))} testId={`setup-env-${e.value}`}>
                  <div>{e.label}</div>
                  <div className="text-[11px] text-slate-500">{e.hint}</div>
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-sm text-slate-300">Technical focus <span className="text-xs text-slate-500">— drill one tool in the technical and scenario rounds</span></div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {FOCUS_OPTIONS.map((f) => (
                <Chip key={f.label} active={cfg.focus === f.value} onClick={() => setCfg((c) => ({ ...c, focus: f.value }))} testId={`setup-focus-${f.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div>{f.label}</div>
                  <div className="text-[11px] text-slate-500">{f.hint}</div>
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-sm text-slate-300">Interview mode</div>
            <div className="grid gap-2 md:grid-cols-2">
              {MODES.map((m) => (
                <Chip key={m.value} active={cfg.mode === m.value} onClick={() => setCfg((c) => ({ ...c, mode: m.value }))} testId={`setup-mode-${m.value}`}>
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-slate-400">{m.desc}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">{isPentest(cfg.position) ? m.rounds.replace("SOC Investigation", "Engagement Scenario") : m.rounds}</div>
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Panel>
            <div className="mb-3 text-sm text-slate-300">Experience type</div>
            <div className="grid gap-2">
              <Chip active={!cfg.coach_mode} onClick={() => setCfg((c) => ({ ...c, coach_mode: false }))} testId="setup-real-mode">
                <div className="font-medium">Real Interview Mode</div>
                <div className="text-xs text-slate-400">No hints, scores or corrections. Neutral interviewers. Feedback after the interview.</div>
              </Chip>
              <Chip active={cfg.coach_mode} onClick={() => setCfg((c) => ({ ...c, coach_mode: true }))} testId="setup-coach-mode">
                <div className="flex items-center gap-1.5 font-medium"><GraduationCap className="size-4" /> Coach Mode</div>
                <div className="text-xs text-slate-400">Pause, retry answers, get instant feedback and hear stronger responses.</div>
              </Chip>
            </div>
          </Panel>
          <Button size="lg" className="h-11 w-full text-base" onClick={() => create.mutate()} disabled={create.isPending} data-testid="setup-generate-button">
            {create.isPending && <Loader2 className="animate-spin" />} Generate company & schedule
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
