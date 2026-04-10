// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import {
  setSession,
  getSession,
  isSessionExpired,
  refreshSessionActivity
} from "../utils/auth";
import {
  rememberOfflineAuth,
  tryOfflineAuth,
} from "../utils/offlineAuth";

export default function Login() {

  const navigate = useNavigate();

  const [form, setForm] = useState({
    shop_id: "",
    username: "",
    password: "",
    branch_id: ""
  });

  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s?.token && !isSessionExpired()) {
      refreshSessionActivity();
      navigate("/home", { replace: true });
    }
  }, []);

  const attemptOfflineLogin = async () => {
    const offlineSession = await tryOfflineAuth(form);
    if (offlineSession) {
      setSession({
        ...offlineSession,
        offline_login: true,
      });
      navigate("/home", { replace: true });
      return true;
    }
    setError("Offline login not available for these credentials. Connect to the internet once and sign in.");
    return false;
  };

  const submit = async () => {
    if (!form.shop_id)
      return setError("Enter Shop ID");
    if (!form.username || !form.password)
      return setError("Enter username & password");

    setError("");
    setLoading(true);

    if (!navigator.onLine) {
      await attemptOfflineLogin();
      setLoading(false);
      return;
    }

    try {
      const res = await api.post("/auth/login", form);

      if (res.data?.available_branches?.length > 1 && !form.branch_id) {
        setBranches(res.data.available_branches);
        setError("Select a branch to continue");
        setLoading(false);
        return;
      }

      const sessionPayload = {
        token: res.data.access_token,
        access_token: res.data.access_token,
        user_id: res.data.user_id,
        user_name: res.data.user_name,
        name: res.data.name,
        role: res.data.role_name,
        shop_id: res.data.shop_id,
        branch_id: res.data.branch_id,
        branch_name: res.data.branch_name,
        branch_close: res.data.branch_close,
        branch_type: res.data.branch_type,
        head_office_branch_id: res.data.head_office_branch_id,
        app_date: res.data.app_date,
      };

      setSession(sessionPayload);

      try {
        await rememberOfflineAuth({
          shop_id: form.shop_id,
          username: form.username,
          password: form.password,
          branch_id: sessionPayload.branch_id,
          session: sessionPayload,
        });
      } catch (err) {
        console.warn("Failed to persist offline auth", err);
      }

      navigate("/home", { replace: true });

    } catch (err) {
      // Network/CORS error from offline bundle — try saved credentials
      if (err?.offline) {
        const ok = await attemptOfflineLogin();
        if (!ok) {
          setError("Cannot reach server. Sign in online at least once to enable offline login.");
        }
      } else {
        const msg = err?.response?.data?.detail || err?.message;
        if (msg) {
          setError(msg);
        } else if (!navigator.onLine) {
          await attemptOfflineLogin();
        } else {
          const networkHint =
            window?.location?.protocol === "https:" ? " (API must be HTTPS)" : "";
          setError(
            `Login failed: cannot reach server${networkHint}. Check API URL / network.`
          );
        }
      }
    }

    setLoading(false);
  };

  const onKey = e => e.key === "Enter" && submit();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0B3C8C] via-[#1a4fa8] to-[#2563eb] relative overflow-hidden">

      {/* Background circles */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white opacity-5" />
      <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-white opacity-5" />
      <div className="absolute top-1/4 right-1/4 w-40 h-40 rounded-full bg-white opacity-5" />

      <div className="relative z-10 flex w-full max-w-4xl mx-4 rounded-3xl overflow-hidden shadow-2xl">

        {/* LEFT PANEL */}
        <div className="hidden md:flex flex-col items-center justify-center w-1/2 bg-white/10 backdrop-blur-sm p-12 text-white">
          {/* Logo icon */}
          <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mb-6 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-center">
            HAAPPII<br />BILLING
          </h1>
          <div className="w-16 h-1 bg-white/60 rounded-full mt-4 mb-6" />
          <p className="text-white/70 text-[13px] text-center leading-relaxed">
            Smart billing solution for<br />modern businesses
          </p>

          <div className="mt-10 space-y-3 w-full">
            {["Fast & Reliable", "Offline Support", "Multi-Branch"].map(f => (
              <div key={f} className="flex items-center gap-3 text-white/80 text-[13px]">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 bg-white flex flex-col justify-center p-8 md:p-10">

          {/* Mobile logo */}
          <div className="md:hidden text-center mb-6">
            <h1 className="text-2xl font-extrabold text-[#0B3C8C]">HAAPPII BILLING</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-1">Welcome back</h2>
          <p className="text-[13px] text-gray-400 mb-6">Sign in to your account</p>

          {error && (
            <div className="mb-4 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2.5 rounded-xl text-[12px]">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="space-y-3">

            {/* Shop ID */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Shop ID</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <input
                  className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                  placeholder="Enter your Shop ID"
                  value={form.shop_id}
                  onChange={e => setForm({ ...form, shop_id: e.target.value })}
                  onKeyDown={onKey}
                />
              </div>
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Username</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  onKeyDown={onKey}
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Password</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  className="w-full border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  onKeyDown={onKey}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Branch selector */}
            {branches.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Branch</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <select
                    className="w-full border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition appearance-none"
                    value={form.branch_id}
                    onChange={e => setForm({ ...form, branch_id: e.target.value })}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => (
                      <option key={b.branch_id} value={b.branch_id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full mt-6 py-3 rounded-xl text-[14px] font-bold text-white transition shadow-md disabled:opacity-60"
            style={{ background: loading ? "#94a3b8" : "linear-gradient(135deg, #0B3C8C, #2563eb)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Signing in...
              </span>
            ) : "Sign In"}
          </button>

          <p className="text-center text-[11px] text-gray-400 mt-4">
            Haappii Billing — Smart POS for modern shops
          </p>
        </div>
      </div>
    </div>
  );
}
