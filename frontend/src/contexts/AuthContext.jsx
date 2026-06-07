import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      // Expected when no session exists — treat as logged out.
      if (err?.response && err.response.status !== 401) {
        console.warn("Auth check failed unexpectedly:", err);
      }
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleAuth = useCallback((data) => {
    if (data.token) tokenStore.set(data.token);
    setUser(data);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    handleAuth(data);
    return data;
  }, [handleAuth]);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    handleAuth(data);
    return data;
  }, [handleAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Server may be unreachable — still clear local state, but surface for debugging.
      console.warn("Logout request failed:", err);
    }
    tokenStore.clear();
    setUser(false);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
