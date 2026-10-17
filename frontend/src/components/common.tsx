import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { POSITION_GROUPS, decisionTone, scoreColor } from "@/lib/constants";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";

export function Panel({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-[#0E1524]/80 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]", className)} {...rest}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500", className)}>{children}</div>;
}

export function ScoreRing({ value, size = 120, label, testId }: { value: number | null | undefined; size?: number; label?: string; testId?: string }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  const stroke = v >= 80 ? "#34D399" : v >= 65 ? "#38BDF8" : v >= 50 ? "#FBBF24" : "#F87171";
  return (
    <div className="relative inline-flex flex-col items-center" data-testid={testId}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1E293B" strokeWidth="8" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={value == null ? "#334155" : stroke}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-heading text-2xl font-semibold", scoreColor(value))}>{value == null ? "—" : Math.round(v)}</span>
        {label && <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>}
      </div>
    </div>
  );
}

export function DecisionBadge({ decision, className, testId }: { decision: string | null | undefined; className?: string; testId?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider", decisionTone(decision), className)} data-testid={testId}>
      {decision ?? "IN PROGRESS"}
    </span>
  );
}

export function Bar({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 80 ? "bg-emerald-400" : v >= 65 ? "bg-sky-400" : v >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div className={cn("h-full rounded-full", value == null ? "bg-slate-700" : color)} style={{ width: `${v}%`, transition: "width 700ms ease-out" }} />
    </div>
  );
}

export function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <Panel className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 font-heading text-2xl font-semibold text-white" data-testid={testId}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Panel>
  );
}

export function EmptyState({ title, desc, action, testId }: { title: string; desc: string; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-white/10 p-8" data-testid={testId}>
      <div className="font-heading text-lg text-white">{title}</div>
      <p className="max-w-md text-sm text-slate-400">{desc}</p>
      {action}
    </div>
  );
}

/** Grouped role options for any position <Select>: SOC & Security Analyst, Penetration Testing. */
export function PositionOptions() {
  return (
    <>
      {POSITION_GROUPS.map((g) => (
        <SelectGroup key={g.label}>
          <SelectLabel className="font-mono text-[10px] tracking-wider text-sky-400/80 uppercase">{g.label}</SelectLabel>
          {g.roles.map((p) => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
