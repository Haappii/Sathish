import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi, setUnauthorizedHandler } from "../api/client";
import { clearStoredSession, getStoredSession, setStoredSession } from "../storage/session";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getStoredSession();
      if (mounted) {
        setSession(s);
        setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async ({ shop_id, username, password }) => {
    const payload = {
      shop_id: String(shop_id || "").trim(),
      username: String(username || "").trim(),
      password: String(password || ""),
    };

    const res = await authApi.post("/auth/login", payload);
    const data = res?.data || {};
    const nextSession = {
      token: data.access_token,
      access_token: data.access_token,
      user_id: data.user_id,
      user_name: data.user_name,
      name: data.name,
      role: data.role_name,
      role_name: data.role_name,
      shop_id: data.shop_id,
      branch_id: data.branch_id,
      branch_name: data.branch_name,
      branch_close: data.branch_close,
      branch_type: data.branch_type,
    };

    await setStoredSession(nextSession);
    setSession(nextSession);
    return nextSession;
  };

  const logout = async () => {
    try {
      const token = session?.access_token || session?.token;
      if (token) {
        await authApi.post("/auth/logout", null, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      await clearStoredSession();
    } finally {
      setSession(null);
    }
  };

  const value = useMemo(
    () => ({
      session,
      booting,
      isLoggedIn: Boolean(session?.access_token || session?.token),
      login,
      logout,
    }),
    [session, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
