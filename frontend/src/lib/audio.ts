import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type { TTSOut } from "@/lib/types";

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function b64ToUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/* ------------------------------------------------------------------ */
/* VOICE ENGINE (client side): plays server TTS, exposes a live level  */
/* that drives the avatar layer. Falls back to browser speech.         */
/* ------------------------------------------------------------------ */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const resolveRef = useRef<(() => void) | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setSpeaking(false);
    setLevel(0);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.();
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    finish();
  }, [finish]);

  const browserSpeak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        setTimeout(resolve, Math.min(12000, text.length * 55));
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.volume = mutedRef.current ? 0 : 1;
      let pulse = 0;
      const iv = window.setInterval(() => setLevel(0.3 + 0.4 * Math.abs(Math.sin((pulse += 0.6)))), 120);
      const done = () => {
        clearInterval(iv);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }, []);

  const speak = useCallback(
    async (text: string, personaId?: string): Promise<void> => {
      stop();
      setSpeaking(true);
      const done = new Promise<void>((res) => (resolveRef.current = res));
      let b64 = "";
      try {
        b64 = (await apiPost<TTSOut>("/voice/tts", { text, persona_id: personaId })).audio_b64;
      } catch {
        await browserSpeak(text);
        finish();
        return done;
      }
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = `data:audio/mpeg;base64,${b64}`;
      audio.muted = mutedRef.current;
      try {
        if (!ctxRef.current) {
          const ctx = new AudioContext();
          const src = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          analyser.connect(ctx.destination);
          ctxRef.current = ctx;
          (audio as HTMLAudioElement & { _an?: AnalyserNode })._an = analyser;
        }
        await ctxRef.current.resume();
      } catch {
        /* analyser optional */
      }
      const an = (audio as HTMLAudioElement & { _an?: AnalyserNode })._an;
      const buf = new Uint8Array(256);
      const tick = () => {
        if (an) {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      audio.onended = finish;
      audio.onerror = finish;
      try {
        await audio.play();
        tick();
      } catch {
        // Autoplay blocked or no audio device: keep conversational timing with captions.
        setTimeout(finish, Math.min(14000, 1200 + text.length * 50));
      }
      return done;
    },
    [browserSpeak, finish, stop],
  );

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking, level, muted, setMuted };
}

/* ------------------------------------------------------------------ */
/* SPEECH CAPTURE with voice-activity detection: starts listening,     */
/* detects when the candidate starts and finishes speaking.            */
/* ------------------------------------------------------------------ */
export interface RecordedAnswer {
  b64: string;
  mime: string;
  seconds: number;
}

export function useVoiceRecorder(onComplete: (a: RecordedAnswer) => void, opts?: { autoStop?: boolean; silenceMs?: number }) {
  const [state, setState] = useState<"idle" | "waiting" | "speaking">("idle");
  const [level, setLevel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const ivRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const cbRef = useRef(onComplete);
  const ownStreamRef = useRef<MediaStream | null>(null);
  cbRef.current = onComplete;
  const autoStop = opts?.autoStop ?? true;
  const silenceMs = opts?.silenceMs ?? 1700;

  const cleanup = useCallback(() => {
    clearInterval(ivRef.current);
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    ownStreamRef.current?.getTracks().forEach((t) => t.stop());
    ownStreamRef.current = null;
    setLevel(0);
    setState("idle");
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else cleanup();
  }, [cleanup]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(
    async (stream?: MediaStream | null) => {
      if (recRef.current && recRef.current.state !== "inactive") return;
      let src = stream && stream.getAudioTracks().length ? stream : null;
      if (!src) {
        src = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        ownStreamRef.current = src;
      }
      const audioStream = new MediaStream(src.getAudioTracks());
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(audioStream, { mimeType: mime }) : new MediaRecorder(audioStream);
      const chunks: Blob[] = [];
      cancelledRef.current = false;
      const startedAt = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        const seconds = (Date.now() - startedAt) / 1000;
        cleanup();
        if (cancelledRef.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        cbRef.current({ b64: await blobToBase64(blob), mime: blob.type, seconds });
      };
      recRef.current = rec;
      rec.start(250);
      setState("waiting");

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(audioStream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let floor = 0.01;
      let samples = 0;
      let voicedMs = 0;
      let speaking = false;
      let lastVoice = Date.now();
      ivRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 8));
        if (samples < 5) {
          floor = Math.max(floor, rms);
          samples++;
          return;
        }
        const thr = Math.max(0.018, floor * 2.2);
        if (rms > thr) {
          voicedMs += 100;
          lastVoice = Date.now();
          if (!speaking && voicedMs >= 300) {
            speaking = true;
            setState("speaking");
          }
        } else if (!speaking) {
          voicedMs = Math.max(0, voicedMs - 50);
        }
        const elapsed = Date.now() - startedAt;
        if ((autoStop && speaking && Date.now() - lastVoice > silenceMs) || elapsed > 240_000) {
          stop();
        }
      }, 100);
    },
    [autoStop, cleanup, silenceMs, stop],
  );

  useEffect(() => () => cancel(), [cancel]);
  return { start, stop, cancel, state, level };
}
