import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { LoadingSkeleton } from "@/components/feedback";
import type { Role } from "@/lib/types";
import { homePathFor, useAuth } from "./AuthContext";

/** Sends visitors to sign in, and users of the wrong role to their own home. (The API enforces the real rules.) */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-6"><LoadingSkeleton /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
}
