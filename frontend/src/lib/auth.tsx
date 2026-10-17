import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { apiGet } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" data-testid="auth-loading">
      <div className="size-6 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { data, isLoading, isError } = useMe();
  const loc = useLocation();
  if (isLoading) return <FullScreenLoader />;
  if (isError || !data) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (admin && data.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
