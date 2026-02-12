import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function Loyalty() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [mobile, setMobile] = useState("");
  const [account, setAccount] = useState(null);
  const [txns, setTxns] = useState([]);

  const [adjust, setAdjust] = useState({ points: "", notes: "" });
  const [redeem, setRedeem] = useState({ points: "", notes: "" });

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.loyalty?.can_read));
        setCanWrite(Boolean(map?.loyalty?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const loadAccount = async (m) => {
    const mm = String(m || "").replace(/\D/g, "");
    if (mm.length !== 10) return showToast("Enter 10-digit mobile", "error");
    try {
      const res = await authAxios.get(`/loyalty/account/by-mobile/${mm}`);
      setAccount(res.data || null);
      setMobile(mm);
      if (res?.data?.customer_id) {
        const t = await authAxios.get(`/loyalty/transactions/${res.data.customer_id}`);
        setTxns(t.data || []);
      } else {
        setTxns([]);
      }
    } catch (e) {
      setAccount(null);
      setTxns([]);
      showToast(e?.response?.data?.detail || "Customer not found", "error");
    }
  };

  const doAdjust = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    const pts = Number(adjust.points || 0);
    if (!Number.isFinite(pts) || pts === 0) return showToast("Enter points (+/-)", "error");
    try {
      const res = await authAxios.post("/loyalty/adjust", {
        mobile,
        points: Math.trunc(pts),
        notes: adjust.notes || undefined,
      });
      setAccount(res.data || null);
      setAdjust({ points: "", notes: "" });
      const t = await authAxios.get(`/loyalty/transactions/${res.data.customer_id}`);
      setTxns(t.data || []);
      showToast("Updated", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Adjust failed", "error");
    }
  };

  const doRedeem = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    const pts = Number(redeem.points || 0);
    if (!Number.isFinite(pts) || pts <= 0) return showToast("Enter points", "error");
    try {
      const res = await authAxios.post("/loyalty/redeem", {
        mobile,
        points: Math.trunc(pts),
        notes: redeem.notes || undefined,
      });
      setAccount(res.data || null);
      setRedeem({ points: "", notes: "" });
      const t = await authAxios.get(`/loyalty/transactions/${res.data.customer_id}`);
      setTxns(t.data || []);
      showToast("Redeemed", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Redeem failed", "error");
    }
  };

  if (allowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-800">Loyalty Points</h2>
        <div />
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <div className="text-sm font-semibold">Find Customer</div>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            className="border rounded-lg px-2 py-2 text-[12px] w-[220px]"
            placeholder="Mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <button
            onClick={() => loadAccount(mobile)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[12px]"
          >
            Search
          </button>
        </div>
      </div>

      {account && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <div className="text-sm font-semibold">Account</div>
            <div className="text-[12px] text-slate-700 space-y-1">
              <div>
                <span className="text-slate-500">Customer:</span>{" "}
                <span className="font-semibold">{account.customer_name}</span>
              </div>
              <div>
                <span className="text-slate-500">Mobile:</span>{" "}
                <span className="font-semibold">{account.mobile}</span>
              </div>
              <div>
                <span className="text-slate-500">Points:</span>{" "}
                <span className="font-extrabold text-emerald-700">
                  {Number(account.points_balance || 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 space-y-2">
            <div className="text-sm font-semibold">Adjust Points</div>
            <div className="text-[11px] text-slate-500">
              Use + for add, - for remove.
            </div>
            <input
              type="number"
              className="border rounded-lg px-2 py-2 text-[12px] w-full"
              placeholder="Points (e.g., 10 or -5)"
              value={adjust.points}
              onChange={(e) => setAdjust({ ...adjust, points: e.target.value })}
            />
            <input
              className="border rounded-lg px-2 py-2 text-[12px] w-full"
              placeholder="Notes (optional)"
              value={adjust.notes}
              onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })}
            />
            <button
              onClick={doAdjust}
              disabled={!canWrite}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
            >
              Save
            </button>
          </div>

          <div className="rounded-xl border bg-white p-4 space-y-2">
            <div className="text-sm font-semibold">Redeem Points</div>
            <input
              type="number"
              className="border rounded-lg px-2 py-2 text-[12px] w-full"
              placeholder="Points to redeem"
              value={redeem.points}
              onChange={(e) => setRedeem({ ...redeem, points: e.target.value })}
            />
            <input
              className="border rounded-lg px-2 py-2 text-[12px] w-full"
              placeholder="Notes (optional)"
              value={redeem.notes}
              onChange={(e) => setRedeem({ ...redeem, notes: e.target.value })}
            />
            <button
              onClick={doRedeem}
              disabled={!canWrite}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white text-[12px] disabled:opacity-60"
            >
              Redeem
            </button>
          </div>
        </div>
      )}

      {account && (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <div className="p-3 text-sm font-semibold">Transactions</div>
          {txns.length === 0 ? (
            <div className="p-3 text-[12px] text-slate-500">No transactions</div>
          ) : (
            <table className="min-w-[900px] w-full text-left text-[12px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2">Type</th>
                  <th className="p-2 text-right">Points</th>
                  <th className="p-2">Invoice</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.txn_id} className="border-t">
                    <td className="p-2 font-semibold">{t.txn_type}</td>
                    <td className="p-2 text-right font-bold">{Number(t.points || 0)}</td>
                    <td className="p-2">{t.invoice_id || "-"}</td>
                    <td className="p-2">{t.notes || "-"}</td>
                    <td className="p-2">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
