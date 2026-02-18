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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border rounded-2xl shadow p-6 w-full max-w-md space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-800">Platform Owner</div>
          <div className="text-[12px] text-slate-500">Login to manage onboarding + support</div>
        </div>

        <div className="space-y-2">
          <label className="text-[12px] text-slate-600">Username</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[12px] text-slate-600">Password</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

