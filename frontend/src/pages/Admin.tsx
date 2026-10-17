import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AvatarConfig, CompanyTemplate, ImportResult, Persona, QuestionIn, QuestionWithStats, Scenario } from "@/lib/types";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Eyebrow, Panel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const detail = (e: unknown) => (e instanceof ApiError ? JSON.stringify((e.body as { detail?: unknown })?.detail ?? e.status) : "Request failed");
const EMPTY_Q: QuestionIn = {
  id: null, text: "", primary_role: "SOC Analyst", soc_level: "All", round: "technical", difficulty: "intermediate", category: "General",
  subcategory: "", expected_concepts: [], rubric: "", follow_ups: [], scenario_capable: false, communication_skills: [], technical_depth: 3, est_answer_seconds: 90,
};

function QuestionDialog({ q, onClose }: { q: QuestionIn | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<QuestionIn>(q ?? EMPTY_Q);
  const save = useMutation({
    mutationFn: () => (f.id ? apiPut(`/admin/questions/${f.id}`, f) : apiPost("/admin/questions", f)),
    onSuccess: () => {
      toast.success("Question saved");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
      onClose();
    },
    onError: (e) => toast.error(detail(e)),
  });
  const list = (k: "expected_concepts" | "follow_ups") => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value.split("\n").filter((x) => x.trim()) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#0B111E] sm:max-w-2xl">
        <DialogHeader><DialogTitle>{f.id ? "Edit question" : "Add question"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Question text</Label><Textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} data-testid="q-text-input" /></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label>Round</Label>
              <Select value={f.round} onValueChange={(v: string) => setF({ ...f, round: v as QuestionIn["round"] })}><SelectTrigger className="w-full" data-testid="q-round-select"><SelectValue /></SelectTrigger>
                <SelectContent>{["hr", "technical", "scenario", "manager"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>SOC level</Label>
              <Select value={f.soc_level} onValueChange={(v: string) => setF({ ...f, soc_level: v })}><SelectTrigger className="w-full" data-testid="q-level-select"><SelectValue /></SelectTrigger>
                <SelectContent>{["All", "L1", "L2", "L3"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Difficulty</Label>
              <Select value={f.difficulty} onValueChange={(v: string) => setF({ ...f, difficulty: v as QuestionIn["difficulty"] })}><SelectTrigger className="w-full" data-testid="q-difficulty-select"><SelectValue /></SelectTrigger>
                <SelectContent>{["beginner", "intermediate", "advanced"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Category</Label><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="q-category-input" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Expected concepts (one per line)</Label><Textarea value={f.expected_concepts.join("\n")} onChange={list("expected_concepts")} className="min-h-28" data-testid="q-concepts-input" /></div>
            <div className="space-y-1"><Label>Follow-ups (one per line)</Label><Textarea value={f.follow_ups.join("\n")} onChange={list("follow_ups")} className="min-h-28" data-testid="q-followups-input" /></div>
          </div>
          <div className="space-y-1"><Label>Scoring rubric</Label><Textarea value={f.rubric} onChange={(e) => setF({ ...f, rubric: e.target.value })} data-testid="q-rubric-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || f.text.trim().length < 5} data-testid="q-save-button">{save.isPending && <Loader2 className="animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JsonDialog<T>({ title, value, path, queryKey, onClose }: { title: string; value: T; path: string; queryKey: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const save = useMutation({
    mutationFn: () => apiPost(path, JSON.parse(text)),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: [queryKey] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof SyntaxError ? "Invalid JSON" : detail(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0B111E] sm:max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[50vh] font-mono text-xs" data-testid="json-editor" />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="json-save-button">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEW_PERSONA: Persona = { id: "", name: "", title: "", round_type: "technical", image_url: "", voice: "alloy", personality: "", speaking_style: "", focus: [], voice_style: "" };
const NEW_SCENARIO: Scenario = { id: "", title: "", severity: "HIGH", source: "", environments: ["enterprise"], level: "L1+", fields: [["Host", ""]], process_tree: [], raw_log: "", mitre: [], interviewer_notes: "" };
const NEW_COMPANY: CompanyTemplate = { id: "", industry: "", environment: "enterprise", name_parts: [["Acme"], ["Corp"]], stack_pool: [], focus: [], employees: [500, 5000] };

export default function Admin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [round, setRound] = useState("all");
  const [editQ, setEditQ] = useState<QuestionIn | null | undefined>(undefined);
  const [json, setJson] = useState<{ title: string; value: unknown; path: string; key: string } | null>(null);
  const [importText, setImportText] = useState("");
  const { data: qs } = useQuery({ queryKey: ["admin-questions"], queryFn: () => apiGet<QuestionWithStats[]>("/admin/questions") });
  const { data: personas } = useQuery({ queryKey: ["personas"], queryFn: () => apiGet<Persona[]>("/personas") });
  const { data: scenarios } = useQuery({ queryKey: ["admin-scenarios"], queryFn: () => apiGet<Scenario[]>("/admin/scenarios") });
  const { data: companies } = useQuery({ queryKey: ["admin-companies"], queryFn: () => apiGet<CompanyTemplate[]>("/admin/companies") });
  const { data: avatar } = useQuery({ queryKey: ["avatar-config"], queryFn: () => apiGet<AvatarConfig>("/avatar/config") });
  const delQ = useMutation({ mutationFn: (id: string) => apiDelete(`/admin/questions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-questions"] }) });
  const del = useMutation({
    mutationFn: ({ path }: { path: string; key: string }) => apiDelete(path),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [v.key] }),
    onError: (e) => toast.error(detail(e)),
  });
  const imp = useMutation({
    mutationFn: () => apiPost<ImportResult>("/admin/questions/import", JSON.parse(importText)),
    onSuccess: (r) => {
      toast.success(`Imported: ${r.inserted} new, ${r.updated} updated`);
      setImportText("");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e) => toast.error(e instanceof SyntaxError ? "Invalid JSON — expected an array of questions" : detail(e)),
  });
  const filtered = useMemo(
    () => (qs ?? []).filter((q) => (round === "all" || q.round === round) && (!search || `${q.text} ${q.category}`.toLowerCase().includes(search.toLowerCase()))),
    [qs, round, search],
  );

  return (
    <AppShell>
      <PageHeader eyebrow="Admin" title="Content management" desc="Question bank, interviewer personas, SOC scenarios, company templates and avatar provider." />
      <Tabs defaultValue="questions">
        <TabsList variant="line">
          <TabsTrigger value="questions" data-testid="admin-tab-questions">Questions ({qs?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="personas" data-testid="admin-tab-personas">Interviewers</TabsTrigger>
          <TabsTrigger value="scenarios" data-testid="admin-tab-scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="companies" data-testid="admin-tab-companies">Companies</TabsTrigger>
          <TabsTrigger value="avatar" data-testid="admin-tab-avatar">Avatar provider</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" data-testid="admin-question-search" />
            <Select value={round} onValueChange={(v: string) => setRound(v)}>
              <SelectTrigger className="w-40" data-testid="admin-question-round-filter"><SelectValue /></SelectTrigger>
              <SelectContent>{["all", "hr", "technical", "scenario", "manager"].map((r) => <SelectItem key={r} value={r}>{r === "all" ? "All rounds" : r}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => setEditQ(null)} data-testid="admin-add-question"><Plus /> Add question</Button>
          </div>
          <Panel className="p-0">
            <Table>
              <TableHeader><TableRow className="border-white/[0.06]"><TableHead>ID</TableHead><TableHead>Question</TableHead><TableHead>Round</TableHead><TableHead>Level</TableHead><TableHead>Difficulty</TableHead><TableHead>Asked</TableHead><TableHead>Avg tech</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {filtered.slice(0, 300).map((q) => (
                  <TableRow key={q.id} className="border-white/[0.05]" data-testid={`admin-question-row-${q.id}`}>
                    <TableCell className="font-mono text-[11px] text-slate-500">{q.id}</TableCell>
                    <TableCell className="max-w-md whitespace-normal text-slate-200">{q.text}<div className="text-[11px] text-slate-500">{q.category}</div></TableCell>
                    <TableCell className="text-xs">{q.round}</TableCell>
                    <TableCell className="text-xs">{q.soc_level}</TableCell>
                    <TableCell className="text-xs">{q.difficulty}</TableCell>
                    <TableCell className="font-mono text-xs">{q.times_asked}</TableCell>
                    <TableCell className="font-mono text-xs">{q.avg_technical ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <button className="p-1 text-slate-400 hover:text-white" onClick={() => setEditQ(q)} data-testid={`admin-edit-question-${q.id}`} aria-label="Edit"><Pencil className="size-3.5" /></button>
                      <button className="p-1 text-slate-400 hover:text-red-300" onClick={() => confirm("Delete this question?") && delQ.mutate(q.id)} data-testid={`admin-delete-question-${q.id}`} aria-label="Delete"><Trash2 className="size-3.5" /></button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
          <Panel className="space-y-3">
            <Eyebrow>Import question bank (JSON array)</Eyebrow>
            <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} className="min-h-28 font-mono text-xs" placeholder='[{"text": "Explain DNS.", "round": "technical", "soc_level": "L1", "difficulty": "beginner", "category": "Networking", "expected_concepts": ["..."]}]' data-testid="admin-import-textarea" />
            <Button variant="secondary" onClick={() => imp.mutate()} disabled={!importText.trim() || imp.isPending} data-testid="admin-import-button"><Upload /> Import</Button>
            <p className="text-xs text-slate-500">Items with an existing <code>id</code> are updated; items without one are added.</p>
          </Panel>
        </TabsContent>

        <TabsContent value="personas" className="mt-6">
          <Button className="mb-4" onClick={() => setJson({ title: "New interviewer", value: NEW_PERSONA, path: "/admin/personas", key: "personas" })} data-testid="admin-add-persona"><Plus /> Add interviewer</Button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {personas?.map((p) => (
              <Panel key={p.id} className="p-0" data-testid={`admin-persona-${p.id}`}>
                <img src={p.image_url} alt={p.name} className="h-40 w-full rounded-t-xl object-cover object-top" />
                <div className="p-4">
                  <div className="text-white">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.title} · {p.round_type} · voice {p.voice}</div>
                  <div className="mt-2 text-xs text-slate-500">{p.personality}</div>
                  <div className="mt-3 flex gap-2">
                    <Button size="xs" variant="secondary" onClick={() => setJson({ title: `Edit ${p.name}`, value: p, path: "/admin/personas", key: "personas" })} data-testid={`admin-edit-persona-${p.id}`}>Edit</Button>
                    <Button size="xs" variant="ghost" onClick={() => confirm(`Delete ${p.name}?`) && del.mutate({ path: `/admin/personas/${p.id}`, key: "personas" })} data-testid={`admin-delete-persona-${p.id}`}>Delete</Button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scenarios" className="mt-6 space-y-3">
          <Button onClick={() => setJson({ title: "New scenario", value: NEW_SCENARIO, path: "/admin/scenarios", key: "admin-scenarios" })} data-testid="admin-add-scenario"><Plus /> Add scenario</Button>
          {scenarios?.map((s) => (
            <Panel key={s.id} className="flex items-center gap-4" data-testid={`admin-scenario-${s.id}`}>
              <span className="rounded border border-orange-400/30 px-1.5 py-0.5 font-mono text-[10px] text-orange-300">{s.severity}</span>
              <div className="flex-1"><div className="text-white">{s.title}</div><div className="text-xs text-slate-500">{s.source} · {s.level} · {s.environments.join(", ")}</div></div>
              <Button size="xs" variant="secondary" onClick={() => setJson({ title: `Edit ${s.title}`, value: s, path: "/admin/scenarios", key: "admin-scenarios" })} data-testid={`admin-edit-scenario-${s.id}`}>Edit</Button>
              <Button size="xs" variant="ghost" onClick={() => confirm("Delete scenario?") && del.mutate({ path: `/admin/scenarios/${s.id}`, key: "admin-scenarios" })} data-testid={`admin-delete-scenario-${s.id}`}>Delete</Button>
            </Panel>
          ))}
        </TabsContent>

        <TabsContent value="companies" className="mt-6 space-y-3">
          <Button onClick={() => setJson({ title: "New company template", value: NEW_COMPANY, path: "/admin/companies", key: "admin-companies" })} data-testid="admin-add-company"><Plus /> Add template</Button>
          {companies?.map((c) => (
            <Panel key={c.id} className="flex items-center gap-4" data-testid={`admin-company-${c.id}`}>
              <div className="flex-1"><div className="text-white">{c.industry}</div><div className="text-xs text-slate-500">{c.environment} · e.g. {c.name_parts[0]?.[0]} {c.name_parts[1]?.[0]} · {c.stack_pool.slice(0, 4).join(", ")}</div></div>
              <Button size="xs" variant="secondary" onClick={() => setJson({ title: `Edit ${c.industry}`, value: c, path: "/admin/companies", key: "admin-companies" })} data-testid={`admin-edit-company-${c.id}`}>Edit</Button>
              <Button size="xs" variant="ghost" onClick={() => confirm("Delete template?") && del.mutate({ path: `/admin/companies/${c.id}`, key: "admin-companies" })} data-testid={`admin-delete-company-${c.id}`}>Delete</Button>
            </Panel>
          ))}
        </TabsContent>

        <TabsContent value="avatar" className="mt-6">
          <Panel className="max-w-2xl space-y-4" data-testid="admin-avatar-config">
            <p className="text-sm text-slate-300">Active: <span className="font-mono text-sky-300">{avatar?.active_provider}</span> · live avatar {avatar?.live_avatar_available ? "available" : "not connected"} · lip-sync {avatar?.lip_sync ? "on" : "off"}</p>
            <div className="divide-y divide-white/[0.05]">
              {avatar?.providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-200">{p.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{p.status.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">The interview AI, voice and scoring engines are independent of the video layer. To connect a real-time avatar provider, add its API key and AVATAR_PROVIDER to the backend environment; an adapter for that provider is then required.</p>
          </Panel>
        </TabsContent>
      </Tabs>
      {editQ !== undefined && <QuestionDialog q={editQ} onClose={() => setEditQ(undefined)} />}
      {json && <JsonDialog title={json.title} value={json.value} path={json.path} queryKey={json.key} onClose={() => setJson(null)} />}
    </AppShell>
  );
}
