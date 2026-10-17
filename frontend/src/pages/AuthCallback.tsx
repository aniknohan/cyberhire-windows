import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { User } from "@/lib/types";

/** Exchanges the Emergent Google `session_id` (URL fragment) for our session cookie, then enters the app. */
export default function AuthCallback() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const done = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sessionId = new URLSearchParams(window.location.hash.slice(1)).get("session_id") ?? "";
    apiPost<User>("/auth/google", { session_id: sessionId })
      .then((u) => {
        qc.clear();
        qc.setQueryData(["me"], u);
        nav("/", { replace: true });
      })
      .catch(() => {
        setError(true);
        nav("/login", { replace: true });
      });
  }, [nav, qc]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-400" data-testid="auth-callback">
      {error ? "Google sign-in failed — please try again." : ""}
    </div>
  );
}
