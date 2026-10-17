import { cn } from "@/lib/utils";
import type { Persona, PublicScenario } from "@/lib/types";
import { AlertTriangle, Terminal } from "lucide-react";

/**
 * AVATAR/VIDEO ENGINE — portrait fallback.
 * Renders a professional portrait with idle micro-motion, listening nods and an audio-level-driven
 * speaking state. A live avatar provider (see GET /api/avatar/config) would replace only this
 * component's body with its video element, receiving the same {speaking, level} inputs.
 */
export function InterviewerStage({
  persona,
  speaking,
  level,
  listening,
  thinking,
  className,
}: {
  persona: Persona;
  speaking: boolean;
  level: number;
  listening: boolean;
  thinking: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-[#05080F]", className)} data-testid="interviewer-stage">
      <img
        src={persona.image_url}
        alt={persona.name}
        className={cn(
          "absolute inset-0 h-full w-full object-cover object-[50%_25%]",
          speaking ? "" : listening ? "anim-listen-nod" : "anim-idle-head",
        )}
        style={
          speaking
            ? { transform: `scale(${1.025 + level * 0.012}) translateY(${-level * 2}px)`, filter: `brightness(${1 + level * 0.06})`, transition: "transform 90ms linear, filter 90ms linear" }
            : undefined
        }
        data-testid="interviewer-portrait"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl ring-2 transition-[box-shadow,opacity] duration-200",
          speaking ? "ring-sky-400/70 anim-speak-ring" : "ring-transparent",
        )}
        style={speaking ? { boxShadow: `inset 0 0 ${20 + level * 50}px rgba(56,189,248,${0.15 + level * 0.25})` } : undefined}
      />
      <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg bg-black/50 px-3 py-2 backdrop-blur-md" data-testid="interviewer-nameplate">
        <div className="flex h-4 items-end gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("w-[3px] rounded-full bg-sky-400", speaking ? "anim-eq-bar" : "opacity-30")}
              style={{ height: speaking ? `${40 + ((i * 23) % 60)}%` : "30%", animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
        <div>
          <div className="text-sm font-medium text-white" data-testid="interviewer-name">{persona.name}</div>
          <div className="text-[11px] text-slate-300" data-testid="interviewer-title">{persona.title}</div>
        </div>
      </div>
      {thinking && (
        <div className="absolute right-4 bottom-4 rounded-md bg-black/50 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur-md" data-testid="interviewer-thinking">
          {persona.name.split(" ")[0]} is taking notes…
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({ scenario }: { scenario: PublicScenario }) {
  const sevTone =
    scenario.severity === "CRITICAL"
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : scenario.severity === "HIGH"
        ? "bg-orange-500/15 text-orange-300 border-orange-500/40"
        : "bg-amber-500/15 text-amber-200 border-amber-500/40";
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070B12]" data-testid="evidence-panel">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <Terminal className="size-3.5 text-sky-400" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Shared screen · {scenario.source}</span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-orange-400" />
          <div>
            <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider", sevTone)} data-testid="evidence-severity">
              {scenario.severity} SEVERITY
            </span>
            <div className="mt-1.5 font-heading text-base font-semibold text-white" data-testid="evidence-title">{scenario.title}</div>
          </div>
        </div>
        <div className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
          {scenario.fields.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
              <span className="font-mono text-[11px] text-slate-500">{k}</span>
              <span className="break-all font-mono text-[12px] text-slate-200">{v}</span>
            </div>
          ))}
        </div>
        {scenario.process_tree.length > 0 && (
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Process tree</div>
            <div className="space-y-1 rounded-lg border border-white/[0.06] bg-black/30 p-3">
              {scenario.process_tree.map((p) => (
                <div key={`${p.pid}-${p.name}`} className="font-mono text-[12px]" style={{ paddingLeft: p.depth * 16 }}>
                  <span className="text-slate-600">{p.depth ? "└─ " : ""}</span>
                  <span className="text-sky-300">{p.name}</span>
                  <span className="text-slate-600"> ({p.pid})</span>
                  {p.cmd && <div className="break-all pl-5 text-[11px] text-slate-400">{p.cmd}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {scenario.raw_log && (
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">Raw events</div>
            <pre className="whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-emerald-300/90">
              {scenario.raw_log}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
