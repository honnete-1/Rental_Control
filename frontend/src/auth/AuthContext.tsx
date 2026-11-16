import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { rememberLanguage, type LanguageCode } from "@/i18n";
import { ApiError, get, patch, post } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  changeLanguage: (code: LanguageCode) => Promise<void>;
  changeTextSize: (size: User["text_size"]) => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export const ME_KEY = ["me"];

async function fetchMe(): Promise<User | null> {
  try {
    return await get<User>("/api/auth/me/");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

function applyTextSize(size: string) {
  document.documentElement.dataset.textSize = size;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const user = me.data ?? null;

  // The saved account preferences win over the browser's stored choice.
  useEffect(() => {
    if (user) {
      if (user.language && user.language !== i18n.language) i18n.changeLanguage(user.language);
      rememberLanguage(user.language);
      applyTextSize(user.text_size);
    } else {
      let size = "normal";
      try {
        size = localStorage.getItem("rc-text-size") ?? "normal";
      } catch {
        /* ignore */
      }
      applyTextSize(size);
    }
  }, [user, i18n]);

  const setUser = useCallback((u: User | null) => qc.setQueryData(ME_KEY, u), [qc]);

  const logout = useCallback(async () => {
    await post("/api/auth/logout/");
    qc.clear();
    qc.setQueryData(ME_KEY, null);
  }, [qc]);

  const changeLanguage = useCallback(
    async (code: LanguageCode) => {
      await i18n.changeLanguage(code);
      rememberLanguage(code);
      if (user) {
        const updated = await patch<User>("/api/auth/me/", { language: code });
        qc.setQueryData(ME_KEY, updated);
      }
    },
    [i18n, user, qc],
  );

  const changeTextSize = useCallback(
    async (size: User["text_size"]) => {
      applyTextSize(size);
      try {
        localStorage.setItem("rc-text-size", size);
      } catch {
        /* ignore */
      }
      if (user) qc.setQueryData(ME_KEY, await patch<User>("/api/auth/me/", { text_size: size }));
    },
    [user, qc],
  );

  const value = useMemo<AuthValue>(
    () => ({ user, loading: me.isPending, setUser, logout, changeLanguage, changeTextSize, refresh: () => qc.invalidateQueries({ queryKey: ME_KEY }) }),
    [user, me.isPending, setUser, logout, changeLanguage, changeTextSize, qc],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homePathFor(user: User | null) {
  if (!user) return "/";
  if (user.role === "tenant") return "/tenant";
  if (user.role === "admin") return "/admin/";
  return "/landlord";
}
