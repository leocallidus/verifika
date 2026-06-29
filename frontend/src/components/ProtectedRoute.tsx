import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import type { Role } from "../types/api";
import type { ReactNode } from "react";

function roleHomePath(role: Role | undefined): string {
  if (role === "teacher") return "/teacher";
  if (role === "admin") return "/admin";
  return "/student";
}

export function ProtectedRoute({
  role,
  children,
  anyOf,
}: {
  role?: Role;
  anyOf?: Role[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center text-[var(--color-text-muted)]">
        Загрузка…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const allowed = anyOf ?? (role ? [role] : []);
  if (!allowed.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
