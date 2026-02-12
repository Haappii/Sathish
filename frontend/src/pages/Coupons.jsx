import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function Coupons() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    code: "",
    name: "",
    discount_type: "FLAT",
    value: "",
    min_bill_amount: "",
    max_discount: "",
    start_date: "",
    end_date: "",
    active: true,
  });

  const [validate, setValidate] = useState({ code: "", amount: "" });
  const [validateRes, setValidateRes] = useState(null);

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.coupons?.can_read));
        setCanWrite(Boolean(map?.coupons?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/coupons/");
      setRows(res.data || []);
    } catch (e) {
      setRows([]);
      showToast(e?.response?.data?.detail || "Failed to load coupons", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const create = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!form.code.trim()) return showToast("Enter code", "error");
    if (!Number(form.value || 0)) return showToast("Enter value", "error");
    try {
      await authAxios.post("/coupons/", {
        code: form.code.trim(),
        name: form.name || undefined,
        discount_type: form.discount_type,
        value: Number(form.value),
        min_bill_amount: form.min_bill_amount ? Number(form.min_bill_amount) : undefined,
        max_discount: form.max_discount ? Number(form.max_discount) : undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        active: Boolean(form.active),
      });
      setForm({
        code: "",
        name: "",
        discount_type: "FLAT",
        value: "",
        min_bill_amount: "",
        max_discount: "",
        start_date: "",
        end_date: "",
        active: true,
      });
      showToast("Coupon created", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Create failed", "error");
    }
  };

  const deactivate = async (id) => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      await authAxios.delete(`/coupons/${id}`);
      showToast("Disabled", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Disable failed", "error");
    }
  };

  const doValidate = async () => {
    const code = validate.code.trim();
    const amount = Number(validate.amount || 0);
    if (!code) return showToast("Enter code", "error");
    if (!amount) return showToast("Enter amount", "error");
    try {
      const res = await authAxios.get(`/coupons/validate/${encodeURIComponent(code)}`, {
        params: { amount },
      });
      setValidateRes(res.data || null);
    } catch (e) {
      setValidateRes(null);
      showToast(e?.response?.data?.detail || "Validate failed", "error");
    }
  };

  const activeCount = useMemo(
    () => (rows || []).filter((r) => Boolean(r.active)).length,
    [rows]
  );

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
        <h2 className="text-lg font-bold text-slate-800">Coupons / Offers</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Create Coupon</div>
          <div className="grid grid-cols-1 gap-2">
            <input
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Code (e.g., SAVE10)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
            <input
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Name (optional)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="border rounded-lg px-2 py-2 text-[12px]"
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
              >
                <option value="FLAT">Flat</option>
                <option value="PERCENT">Percent</option>
              </select>
              <input
                type="number"
                className="border rounded-lg px-2 py-2 text-[12px]"
                placeholder="Value"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="border rounded-lg px-2 py-2 text-[12px]"
                placeholder="Min bill (optional)"
                value={form.min_bill_amount}
                onChange={(e) => setForm({ ...form, min_bill_amount: e.target.value })}
              />
              <input
                type="number"
                className="border rounded-lg px-2 py-2 text-[12px]"
                placeholder="Max discount (optional)"
                value={form.max_discount}
                onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="border rounded-lg px-2 py-2 text-[12px]"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              <input
                type="date"
                className="border rounded-lg px-2 py-2 text-[12px]"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={Boolean(form.active)}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active
            </label>
          </div>

          <button
            onClick={create}
            disabled={!canWrite}
            className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            Create
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Validate Coupon</div>
          <div className="grid grid-cols-1 gap-2">
            <input
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Code"
              value={validate.code}
              onChange={(e) => setValidate({ ...validate, code: e.target.value })}
            />
            <input
              type="number"
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Bill amount"
              value={validate.amount}
              onChange={(e) => setValidate({ ...validate, amount: e.target.value })}
            />
            <button
              onClick={doValidate}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[12px]"
            >
              Validate
            </button>
            {validateRes && (
              <div
                className={`text-[12px] rounded-lg border p-2 ${
                  validateRes.valid ? "bg-emerald-50" : "bg-rose-50"
                }`}
              >
                <div className="font-semibold">{validateRes.message}</div>
                <div className="mt-1">
                  Discount:{" "}
                  <span className="font-bold">
                    Rs. {Number(validateRes.discount_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-1">
          <div className="text-sm font-semibold">Summary</div>
          <div className="text-[12px] text-slate-700">
            Total coupons: <span className="font-bold">{rows.length}</span>
          </div>
          <div className="text-[12px] text-slate-700">
            Active: <span className="font-bold text-emerald-700">{activeCount}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        <div className="p-3 text-sm font-semibold">Coupons</div>
        {loading ? (
          <div className="p-3 text-[12px] text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-[12px] text-slate-500">No coupons</div>
        ) : (
          <table className="min-w-[1000px] w-full text-left text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Value</th>
                <th className="p-2 text-right">Min</th>
                <th className="p-2 text-right">Max</th>
                <th className="p-2">Start</th>
                <th className="p-2">End</th>
                <th className="p-2">Active</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.coupon_id} className="border-t">
                  <td className="p-2 font-bold">{r.code}</td>
                  <td className="p-2">{r.name || "-"}</td>
                  <td className="p-2">{r.discount_type}</td>
                  <td className="p-2 text-right">{Number(r.value || 0).toFixed(2)}</td>
                  <td className="p-2 text-right">{Number(r.min_bill_amount || 0).toFixed(2)}</td>
                  <td className="p-2 text-right">
                    {r.max_discount == null ? "-" : Number(r.max_discount || 0).toFixed(2)}
                  </td>
                  <td className="p-2">{r.start_date || "-"}</td>
                  <td className="p-2">{r.end_date || "-"}</td>
                  <td className="p-2">{r.active ? "YES" : "NO"}</td>
                  <td className="p-2">
                    {r.active ? (
                      <button
                        onClick={() => deactivate(r.coupon_id)}
                        disabled={!canWrite}
                        className="px-2 py-1 rounded border text-rose-600 disabled:opacity-60"
                      >
                        Disable
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
