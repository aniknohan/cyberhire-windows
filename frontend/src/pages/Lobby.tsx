import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CameraOff, Mic, MicOff, Volume2, Building2, ShieldAlert, Loader2, Captions } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { Interview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Panel, Eyebrow } from "@/components/common";
import { cn } from "@/lib/utils";

export interface MeetingPrefs {
  cam: boolean;
  mic: boolean;
  captions: boolean;
}

export function readPrefs(): MeetingPrefs {
  try {
    return { cam: true, mic: true, captions: true, ...JSON.parse(sessionStorage.getItem("soc-prefs") || "{}") };
  } catch {
    return { cam: true, mic: true, captions: true };
  }
}

export default function Lobby() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: iv } = useQuery({ queryKey: ["interview", id], queryFn: () => apiGet<Interview>(`/interviews/${id}`) });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [prefs, setPrefs] = useState<MeetingPrefs>(readPrefs);
  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [micLevel, setMicLevel] = useState(0);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | null = null;
    let raf = 0;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setPermission("granted");
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => undefined);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = prefs.cam));
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = prefs.mic));
  }, [prefs]);

  const join = useMutation({
    mutationFn: () => apiPost<Interview>(`/interviews/${id}/join`, { record_audio: consent }),
    onSuccess: () => {
      sessionStorage.setItem("soc-prefs", JSON.stringify(prefs));
      nav(`/interview/${id}/room`);
    },
    onError: () => toast.error("Could not join the meeting. Please try again."),
  });

  const speakerTest = () => {
    if (!("speechSynthesis" in window)) return toast("Speaker test is not supported in this browser.");
    const u = new SpeechSynthesisUtterance("This is a speaker test. If you can hear this, your audio is working.");
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  };

  const round = iv?.rounds[iv.current_round];

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.08] bg-[#05080F]" data-testid="lobby-camera-preview">
            <video ref={videoRef} autoPlay muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", !prefs.cam && "invisible")} />
            {(!prefs.cam || permission !== "granted") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                <div className="flex size-20 items-center justify-center rounded-full bg-white/[0.06] font-heading text-2xl text-white">{me?.name?.[0] ?? "?"}</div>
                <span className="text-sm" data-testid="lobby-camera-status">
                  {permission === "denied" ? "Camera/microphone unavailable — you can still type answers" : permission === "pending" ? "Requesting camera…" : "Camera is off"}
                </span>
              </div>
            )}
            <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white backdrop-blur">{me?.name} (You)</div>
            {permission === "granted" && prefs.cam && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[11px] text-emerald-300 backdrop-blur" data-testid="lobby-camera-active-indicator">
                <span className="size-1.5 rounded-full bg-emerald-400 anim-live-dot" /> Camera active · preview only, never recorded
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant={prefs.mic ? "secondary" : "destructive"} size="lg" onClick={() => setPrefs((p) => ({ ...p, mic: !p.mic }))} data-testid="lobby-mic-toggle">
              {prefs.mic ? <Mic /> : <MicOff />} {prefs.mic ? "Mic on" : "Mic off"}
            </Button>
            <Button variant={prefs.cam ? "secondary" : "destructive"} size="lg" onClick={() => setPrefs((p) => ({ ...p, cam: !p.cam }))} data-testid="lobby-camera-toggle">
              {prefs.cam ? <Camera /> : <CameraOff />} {prefs.cam ? "Camera on" : "Camera off"}
            </Button>
            <Button variant="secondary" size="lg" onClick={speakerTest} data-testid="lobby-speaker-test">
              <Volume2 /> Test speaker
            </Button>
            <Button variant={prefs.captions ? "secondary" : "outline"} size="lg" onClick={() => setPrefs((p) => ({ ...p, captions: !p.captions }))} data-testid="lobby-captions-toggle">
              <Captions /> Captions {prefs.captions ? "on" : "off"}
            </Button>
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400" data-testid="lobby-mic-status">
              <Mic className="size-3.5" />
              <div className="flex h-3 items-end gap-[2px]">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className={cn("w-1 rounded-sm", micLevel * 10 > i && prefs.mic ? "bg-emerald-400" : "bg-white/10")} style={{ height: `${30 + i * 7}%` }} />
                ))}
              </div>
              {permission === "granted" ? (prefs.mic ? "Microphone working" : "Muted") : "No microphone"}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <Eyebrow>Meeting lobby</Eyebrow>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white" data-testid="lobby-title">Ready to join?</h1>
          </div>
          <Panel className="space-y-3">
            <div className="flex items-center gap-2 text-white">
              <Building2 className="size-4 text-sky-400" />
              <span className="font-medium" data-testid="lobby-company-name">{iv?.company.name ?? "…"}</span>
              <span className="text-xs text-slate-500">· {iv?.company.industry}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Eyebrow>Position</Eyebrow>
                <div className="mt-1 text-slate-200" data-testid="lobby-position">{iv?.position}</div>
              </div>
              <div>
                <Eyebrow>Candidate</Eyebrow>
                <div className="mt-1 text-slate-200" data-testid="lobby-candidate">{me?.name}</div>
              </div>
              <div>
                <Eyebrow>Round</Eyebrow>
                <div className="mt-1 text-slate-200" data-testid="lobby-round">
                  {round ? `${round.index + 1} of ${iv?.rounds.length} · ${round.label}` : "…"}
                </div>
              </div>
              <div>
                <Eyebrow>Mode</Eyebrow>
                <div className="mt-1 text-slate-200">{iv?.coach_mode ? "Coach Mode" : "Real Interview"}</div>
              </div>
            </div>
            {round && (
              <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3" data-testid="lobby-interviewer-card">
                <img src={round.persona.image_url} alt={round.persona.name} className="size-12 rounded-full object-cover object-top" />
                <div>
                  <div className="text-sm font-medium text-white">{round.persona.name}</div>
                  <div className="text-xs text-slate-400">{round.persona.title}</div>
                </div>
                <span className="ml-auto text-[11px] text-slate-500">Waiting for you</span>
              </div>
            )}
          </Panel>
          <Panel className="space-y-3 text-xs text-slate-400" data-testid="lobby-privacy-panel">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <ShieldAlert className="size-4 text-sky-400" /> Privacy
            </div>
            <p>Your camera is shown only to you and is never recorded or uploaded. Your microphone is active only while the interviewer is listening to your answer; each answer is sent securely for transcription.</p>
            <div className="flex items-start gap-2">
              <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} data-testid="lobby-record-consent-checkbox" />
              <Label htmlFor="consent" className="text-xs leading-relaxed font-normal text-slate-300">
                Save my answer audio so I can replay it in the review (optional — you can delete recordings anytime).
              </Label>
            </div>
          </Panel>
          <Button size="lg" className="h-12 text-base" disabled={!iv || join.isPending} onClick={() => join.mutate()} data-testid="lobby-join-button">
            {join.isPending ? <Loader2 className="animate-spin" /> : null} JOIN INTERVIEW
          </Button>
          <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => nav("/")} data-testid="lobby-cancel-link">
            Not now — back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
