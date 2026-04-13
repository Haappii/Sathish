import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi, setUnauthorizedHandler } from "../api/client";
import { clearStoredSession, getStoredSession, setStoredSession } from "../storage/session";
import {
  canUseBiometric,
  getSecuritySettings,
  hasSecurityPin,
  promptBiometric,
  verifySecurityPin,
} from "../storage/security";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [unlockRequired, setUnlockRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [securityConfig, setSecurityConfig] = useState({
    pinEnabled: false,
    biometricEnabled: false,
  });

  const resolveUnlockState = async (activeSession) => {
    if (!activeSession?.access_token && !activeSession?.token) {
      setUnlockRequired(false);
      setUnlocked(false);
      setSecurityConfig({ pinEnabled: false, biometricEnabled: false });
      return;
    }

    const [security, pinExists] = await Promise.all([getSecuritySettings(), hasSecurityPin()]);
    const pinEnabled = Boolean(security?.pinEnabled && pinExists);
    const biometricEnabled = Boolean(security?.biometricEnabled);
    const needUnlock = pinEnabled || biometricEnabled;

    setSecurityConfig({ pinEnabled, biometricEnabled });
    setUnlockRequired(needUnlock);
    setUnlocked(!needUnlock);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getStoredSession();
      if (mounted) {
        setSession(s);
        await resolveUnlockState(s);
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
      setUnlockRequired(false);
      setUnlocked(false);
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
      app_date: data.app_date
        ? String(data.app_date).split("T")[0]
        : new Date().toISOString().split("T")[0],
    };

    await setStoredSession(nextSession);
    setSession(nextSession);
    setUnlockRequired(false);
    setUnlocked(true);
    return nextSession;
  };

  const unlockWithPin = async (pin) => {
    const ok = await verifySecurityPin(pin);
    if (!ok) return false;
    setUnlocked(true);
    return true;
  };

  const unlockWithBiometric = async () => {
    const available = await canUseBiometric();
    if (!available?.available) return { ok: false, reason: available?.reason || "Biometric not available" };
    const result = await promptBiometric("Unlock Haappii Billing");
    if (!result?.success) return { ok: false, reason: result?.reason || "Biometric authentication failed" };
    setUnlocked(true);
    return { ok: true };
  };

  const unlockWithPassword = async (password) => {
    const normalizedPassword = String(password || "");
    const shopId = String(session?.shop_id || "").trim();
    const username = String(session?.user_name || "").trim();
    const token = session?.access_token || session?.token || null;

    if (!shopId || !username || !normalizedPassword) {
      return { ok: false, reason: "Shop, user, or password is missing" };
    }

    try {
      if (token) {
        await authApi.post("/auth/logout", null, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }

      const res = await authApi.post("/auth/login", {
        shop_id: shopId,
        username,
        password: normalizedPassword,
      });
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
        app_date: data.app_date
          ? String(data.app_date).split("T")[0]
          : new Date().toISOString().split("T")[0],
      };

      await setStoredSession(nextSession);
      setSession(nextSession);
      setUnlockRequired(Boolean(securityConfig?.pinEnabled || securityConfig?.biometricEnabled));
      setUnlocked(true);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: String(err?.response?.data?.detail || err?.message || "Invalid password"),
      };
    }
  };

  const usePasswordLoginFallback = async () => {
    await clearStoredSession();
    setSession(null);
    setUnlockRequired(false);
    setUnlocked(false);
    setSecurityConfig({ pinEnabled: false, biometricEnabled: false });
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
      setUnlockRequired(false);
      setUnlocked(false);
      setSecurityConfig({ pinEnabled: false, biometricEnabled: false });
    }
  };

  const value = useMemo(
    () => ({
      session,
      booting,
      isAuthenticated: Boolean(session?.access_token || session?.token),
      isLoggedIn: Boolean(session?.access_token || session?.token) && (!unlockRequired || unlocked),
      unlockRequired,
      unlocked,
      securityConfig,
      login,
      unlockWithPin,
      unlockWithBiometric,
      unlockWithPassword,
      usePasswordLoginFallback,
      logout,
    }),
    [session, booting, unlockRequired, unlocked, securityConfig]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
