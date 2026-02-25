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
        branch_type: res.data.branch_type
      };

      setSession(sessionPayload);

      // Remember for offline login (best-effort).
      rememberOfflineAuth({
        shop_id: form.shop_id,
        username: form.username,
        password: form.password,
        branch_id: sessionPayload.branch_id,
        session: sessionPayload,
      }).catch(() => {});

      navigate("/home", { replace: true });

    } catch (err) {
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

    setLoading(false);
  };

  const onKey = e => e.key === "Enter" && submit();

  return (
    <div className="min-h-screen w-full flex bg-white relative overflow-hidden">

      {/* LEFT BLUE PANEL */}
      <div className="w-3/4 bg-[#3743DB] flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-6xl font-extrabold tracking-wide leading-tight">
            HAAPPII<br />BILLING
          </h1>
          <div className="w-24 h-[3px] bg-white mx-auto mt-4 rounded-full" />
        </div>
      </div>

      {/* RIGHT WHITE PANEL */}
      <div className="w-1/4 bg-white" />

      {/* LOGIN BOX */}
      <div
        className="
          absolute top-1/2 -translate-y-1/2
          left-[75%] -translate-x-1/2
          w-[430px]
          bg-white
          border-4 border-[#3743DB]
          rounded-2xl
          shadow-2xl
        "
      >
        <div className="p-8">

          <h2 className="text-3xl font-bold text-[#3743DB] text-center mb-4">
            LOGIN
          </h2>

          {error && (
            <div className="mb-3 bg-red-50 text-red-700 border px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              className="w-full border px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#3743DB]"
              placeholder="Shop ID"
              value={form.shop_id}
              onChange={e => setForm({ ...form, shop_id: e.target.value })}
              onKeyDown={onKey}
            />
            <input
              className="w-full border px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#3743DB]"
              placeholder="Username"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              onKeyDown={onKey}
            />

            <input
              type="password"
              className="w-full border px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#3743DB]"
              placeholder="Password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              onKeyDown={onKey}
            />

            {branches.length > 0 && (
              <select
                className="w-full border px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#3743DB]"
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
            )}
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className={`w-full mt-6 py-2.5 rounded-lg font-semibold tracking-wide transition
              ${loading
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-[#3743DB] hover:bg-[#222fb3] text-white shadow-lg"
              }`}
          >
            {loading ? "Signing In..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
