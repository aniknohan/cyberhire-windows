import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet } from "@/lib/api";
import type { InterviewSummary } from "@/lib/types";
import { fmtDuration, scoreColor } from "@/lib/constants";
import AppShell, { PageHeader } from "@/components/AppShell";
import { DecisionBadge, EmptyState, Panel } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function History() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["interviews"], queryFn: () => apiGet<InterviewSummary[]>("/interviews") });
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/interviews/${id}`),
    onSuccess: () => {
      toast.success("Interview deleted");
      qc.invalidateQueries({ queryKey: ["interviews"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const link = (r: InterviewSummary) => (["completed", "evaluating", "failed"].includes(r.status) ? `/interview/${r.id}/report` : `/interview/${r.id}/lobby`);
  return (
    <AppShell>
      <PageHeader eyebrow="Interview history" title="Every interview, saved" desc="Reopen any interview to review answers, transcripts, scores and the hiring decision." />
      {!isLoading && !data?.length ? (
        <EmptyState testId="history-empty" title="No interviews yet" desc="Your completed interviews will appear here." action={<Link to="/interview/new" className={buttonVariants()}>Start interview</Link>} />
      ) : (
        <Panel className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06]">
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="hidden md:table-cell">Interviewers</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Comm.</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((r) => (
                <TableRow key={r.id} className="border-white/[0.05]" data-testid={`history-row-${r.id}`}>
                  <TableCell className="text-slate-400">{new Date(r.created_at).toLocaleDateString()}<div className="text-[11px] text-slate-600">{fmtDuration(r.duration_seconds)}</div></TableCell>
                  <TableCell><Link to={link(r)} className="text-white hover:text-sky-300" data-testid={`history-open-${r.id}`}>{r.company_name}</Link><div className="text-[11px] text-slate-500">{r.industry}</div></TableCell>
                  <TableCell className="text-slate-300">{r.position}<div className="text-[11px] text-slate-500">{r.soc_level} · {r.mode}</div></TableCell>
                  <TableCell className="hidden max-w-[220px] truncate text-xs text-slate-400 md:table-cell">{r.interviewers.join(", ")}</TableCell>
                  <TableCell className={`font-mono ${scoreColor(r.job_readiness)}`}>{r.job_readiness != null ? Math.round(r.job_readiness) : "—"}</TableCell>
                  <TableCell className={`font-mono ${scoreColor(r.communication)}`}>{r.communication != null ? Math.round(r.communication) : "—"}</TableCell>
                  <TableCell><DecisionBadge decision={r.decision ?? r.status.toUpperCase().replace("_", " ")} /></TableCell>
                  <TableCell>
                    <button
                      onClick={() => confirm("Delete this interview, its transcripts and recordings?") && del.mutate(r.id)}
                      className="rounded p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      data-testid={`history-delete-${r.id}`}
                      aria-label="Delete interview"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </AppShell>
  );
}
