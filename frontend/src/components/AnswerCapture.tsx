import { useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useVoiceRecorder, type RecordedAnswer } from "@/lib/audio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Record-or-type answer capture used by practice modules and "Practice again". */
export function AnswerCapture({
  onSubmit,
  busy,
  testId,
  allowTyping = true,
}: {
  onSubmit: (a: { audio_b64?: string; mime?: string; text?: string }) => void;
  busy: boolean;
  testId: string;
  allowTyping?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const rec = useVoiceRecorder((a: RecordedAnswer) => onSubmit({ audio_b64: a.b64, mime: a.mime }), { autoStop: true, silenceMs: 2200 });
  const recording = rec.state !== "idle";

  const startRec = () =>
    rec.start().catch(() => {
      toast.error("Microphone unavailable", { description: "Allow microphone access in your browser, or type your answer." });
      setShowType(true);
    });

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <Button onClick={startRec} disabled={busy} size="lg" data-testid={`${testId}-record`}>
            {busy ? <Loader2 className="animate-spin" /> : <Mic />} {busy ? "Analyzing…" : "Record answer"}
          </Button>
        ) : (
          <Button variant="destructive" size="lg" onClick={() => rec.stop()} data-testid={`${testId}-stop`}>
            <Square /> Stop
          </Button>
        )}
        {recording && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={cn("size-2 rounded-full", rec.state === "speaking" ? "bg-emerald-400 anim-live-dot" : "bg-red-400 anim-live-dot")} />
            {rec.state === "speaking" ? "Listening — pause to finish" : "Recording — start speaking"}
            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-400" style={{ width: `${rec.level * 100}%` }} />
            </div>
          </div>
        )}
        {allowTyping && !recording && (
          <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setShowType((s) => !s)} data-testid={`${testId}-type-toggle`}>
            {showType ? "Hide typing" : "Type instead"}
          </button>
        )}
      </div>
      {showType && (
        <div className="flex flex-col gap-2">
          <Textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer…" className="min-h-24" data-testid={`${testId}-text`} />
          <Button
            variant="secondary"
            className="self-start"
            disabled={busy || !typed.trim()}
            onClick={() => {
              onSubmit({ text: typed.trim() });
              setTyped("");
            }}
            data-testid={`${testId}-submit-text`}
          >
            Submit answer
          </Button>
        </div>
      )}
    </div>
  );
}
