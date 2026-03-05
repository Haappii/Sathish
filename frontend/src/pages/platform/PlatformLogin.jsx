import { useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { setPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

export default function PlatformLogin() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      showToast("Enter username and password", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await platformAxios.post("/platform/auth/login", {
        username: username.trim(),
        password,
      });
      const token = res?.data?.access_token;
      if (!token) throw new Error("No token");
      setPlatformToken(token);
      navigate("/platform/dashboard", { replace: true });
    } catch (err) {
      showToast(err?.response?.data?.detail || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 text-white flex items-center justify-center p-6">
      <div className="grid gap-8 w-full max-w-5xl lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[12px]">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Platform Console
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Control onboarding, demos, <br className="hidden sm:block" />
            and every shop from one place.
          </h1>
          <p className="text-sm text-slate-300 max-w-xl">
            Approve requests, spin up demos, check revenue, and keep support flowing. Secure access for platform owners
            only.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-200">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">Onboarding</span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">Revenue</span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">Support</span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">Demo Control</span>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="bg-white/10 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-xl p-8 space-y-5"
        >
          <div>
            <div className="text-lg font-semibold">Sign in</div>
            <div className="text-[12px] text-slate-200">Platform owner credentials only</div>
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-slate-200">Username</label>
            <input
              className="w-full border border-white/20 rounded-xl px-3 py-2 text-sm bg-white/5 focus:border-blue-400 outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-slate-200">Password</label>
            <input
              className="w-full border border-white/20 rounded-xl px-3 py-2 text-sm bg-white/5 focus:border-blue-400 outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-900/40 disabled:opacity-60 transition"
          >
            {loading ? "Signing in..." : "Enter Console"}
          </button>
        </form>
      </div>
    </div>
  );
}
