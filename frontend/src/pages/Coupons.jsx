import { useEffect, useMemo, useState } from "react";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getBusinessDate, normalizeBusinessDate } from "../utils/businessDate";
import { modulesToPermMap } from "../utils/navigationMenu";
import BackButton from "../components/BackButton";
import {
  FaTicketAlt, FaPlus, FaCheckCircle, FaTimesCircle,
  FaPercentage, FaTag,
} from "react-icons/fa";
import { MdLocalOffer } from "react-icons/md";
import { IoClose } from "react-icons/io5";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

export default function Coupons() {
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    code: "", name: "", discount_type: "FLAT", value: "",
    min_bill_amount: "", max_discount: "",
    start_date: "", end_date: "", active: true,
  };
  const [form, setForm] = useState(emptyForm);
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const [validate, setValidate] = useState({ code: "", amount: "" });
  const [validateRes, setValidateRes] = useState(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    authAxios.get("/permissions/my")
      .then(r => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.coupons?.can_read));
        setCanWrite(Boolean(map?.coupons?.can_write));
      })
      .catch(() => { setAllowed(false); setCanWrite(false); });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/coupons/");
      setRows(res.data || []);
    } catch (e) {
      setRows([]);
      showToast(e?.response?.data?.detail || "Failed to load coupons", "error");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!allowed) return; load(); }, [allowed]);

  const create = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!form.code.trim()) return showToast("Enter coupon code", "error");
    if (!Number(form.value || 0)) return showToast("Enter discount value", "error");
    setSaving(true);
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
      setForm(emptyForm);
      setShowForm(false);
      showToast("Coupon created", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Create failed", "error");
    } finally { setSaving(false); }
  };

  const deactivate = async id => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      await authAxios.delete(`/coupons/${id}`);
      showToast("Coupon disabled", "success");
      load();
    } catch (e) { showToast(e?.response?.data?.detail || "Disable failed", "error"); }
  };

  const doValidate = async () => {
    const code = validate.code.trim();
    const amount = Number(validate.amount || 0);
    if (!code) return showToast("Enter coupon code", "error");
    if (!amount) return showToast("Enter bill amount", "error");
    setValidating(true);
    try {
      const res = await authAxios.get(`/coupons/validate/${encodeURIComponent(code)}`, { params: { amount } });
      setValidateRes(res.data || null);
    } catch (e) {
      setValidateRes(null);
      showToast(e?.response?.data?.detail || "Validate failed", "error");
    } finally { setValidating(false); }
  };

  const activeCount = useMemo(() => rows.filter(r => Boolean(r.active)).length, [rows]);

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center max-w-sm">
          <FaTicketAlt size={32} className="mx-auto mb-3 text-red-400" />
          <p className="font-semibold text-slate-800">Access Denied</p>
          <p className="text-sm text-slate-500 mt-1">You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdLocalOffer size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Coupons & Offers</h1>
              <p className="text-xs text-slate-500">{rows.length} total · {activeCount} active</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
              Refresh
            </button>
            {canWrite && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium shadow-sm hover:opacity-90 transition"
                style={{ background: BLUE }}
              >
                <FaPlus size={11} /> New Coupon
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Stats + Validate row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stat cards */}
          <StatCard icon={<FaTicketAlt size={16} />} label="Total Coupons" value={rows.length} color={BLUE} />
          <StatCard icon={<FaCheckCircle size={16} />} label="Active" value={activeCount} color="#10b981" />
          <StatCard icon={<FaTimesCircle size={16} />} label="Inactive" value={rows.length - activeCount} color="#94a3b8" />
        </div>

        {/* Validate coupon panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <FaCheckCircle size={13} className="text-emerald-600" />
            <span className="font-semibold text-sm text-slate-800">Validate Coupon</span>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 flex-1 min-w-[160px]">
                <label className="text-xs font-semibold text-slate-600">Coupon Code</label>
                <input
                  className={inputClass}
                  placeholder="e.g. SAVE10"
                  value={validate.code}
                  onChange={e => setValidate({ ...validate, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5 flex-1 min-w-[140px]">
                <label className="text-xs font-semibold text-slate-600">Bill Amount (₹)</label>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="0.00"
                  value={validate.amount}
                  onChange={e => setValidate({ ...validate, amount: e.target.value })}
                />
              </div>
              <button
                onClick={doValidate}
                disabled={validating}
                className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60"
              >
                {validating ? "Checking…" : "Validate"}
              </button>
              {validateRes && (
                <button onClick={() => setValidateRes(null)} className="px-3 py-2.5 rounded-xl text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 transition">
                  Clear
                </button>
              )}
            </div>

            {validateRes && (
              <div className={`mt-4 rounded-2xl border p-4 flex items-start gap-4 ${validateRes.valid ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${validateRes.valid ? "bg-emerald-100" : "bg-red-100"}`}>
                  {validateRes.valid
                    ? <FaCheckCircle size={18} className="text-emerald-600" />
                    : <FaTimesCircle size={18} className="text-red-500" />
                  }
                </div>
                <div>
                  <p className={`font-semibold text-sm ${validateRes.valid ? "text-emerald-800" : "text-red-700"}`}>{validateRes.message}</p>
                  {validateRes.valid && (
                    <p className="text-sm text-emerald-700 mt-1">
                      Discount: <span className="font-bold text-lg">₹{Number(validateRes.discount_amount || 0).toFixed(2)}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coupon list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-semibold text-sm text-slate-800">All Coupons</h2>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <FaTicketAlt size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No coupons yet</p>
              {canWrite && (
                <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-medium text-blue-600 hover:underline">
                  Create your first coupon
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
              {rows.map(r => (
                <CouponCard key={r.coupon_id} coupon={r} canWrite={canWrite} onDisable={() => deactivate(r.coupon_id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Coupon Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                  <FaPlus size={13} style={{ color: BLUE }} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Create Coupon</h3>
                  <p className="text-xs text-slate-500">Add a new discount coupon</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                <IoClose size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Code <span className="text-red-400">*</span></label>
                  <input
                    className={inputClass}
                    placeholder="e.g. SAVE10"
                    value={form.code}
                    onChange={e => sf("code", e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Name</label>
                  <input
                    className={inputClass}
                    placeholder="Display name (optional)"
                    value={form.name}
                    onChange={e => sf("name", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Discount Type <span className="text-red-400">*</span></label>
                  <select className={inputClass} value={form.discount_type} onChange={e => sf("discount_type", e.target.value)}>
                    <option value="FLAT">Flat (₹)</option>
                    <option value="PERCENT">Percent (%)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Value <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder={form.discount_type === "PERCENT" ? "e.g. 10" : "e.g. 50"}
                    value={form.value}
                    onChange={e => sf("value", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Min Bill Amount</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="Optional"
                    value={form.min_bill_amount}
                    onChange={e => sf("min_bill_amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Max Discount Cap</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="Optional"
                    value={form.max_discount}
                    onChange={e => sf("max_discount", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Start Date</label>
                  <input type="date" className={inputClass} value={form.start_date} onChange={e => sf("start_date", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">End Date</label>
                  <input type="date" className={inputClass} value={form.end_date} onChange={e => sf("end_date", e.target.value)} />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:border-blue-200 transition">
                <div>
                  <p className="text-sm font-medium text-slate-800">Active immediately</p>
                  <p className="text-xs text-slate-500 mt-0.5">Coupon can be used right after creation</p>
                </div>
                <div className="relative flex-shrink-0" onClick={() => sf("active", !form.active)}>
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.active ? "bg-blue-600" : "bg-slate-200"}`} />
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </label>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                Cancel
              </button>
              <button
                onClick={create}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
                style={{ background: BLUE }}
              >
                {saving ? "Creating…" : "Create Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/* ── Coupon Card ── */
function CouponCard({ coupon: r, canWrite, onDisable }) {
  const isPercent = r.discount_type === "PERCENT";
  const businessDate = getBusinessDate();
  const endDate = normalizeBusinessDate(r.end_date);
  const expired = Boolean(endDate && endDate < businessDate);

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition ${r.active && !expired ? "border-slate-100 hover:border-slate-200" : "border-slate-100 opacity-60"}`}>
      {/* Top strip */}
      <div className="px-4 pt-4 pb-3 relative" style={{ background: r.active && !expired ? `${BLUE}08` : "#f8fafc" }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-wider text-slate-800">{r.code}</span>
            </div>
            {r.name && <p className="text-xs text-slate-500 mt-0.5">{r.name}</p>}
          </div>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isPercent ? "bg-violet-50 text-violet-600" : "bg-amber-50 text-amber-600"}`}>
            {isPercent ? <FaPercentage size={14} /> : <FaTag size={14} />}
          </div>
        </div>

        {/* Value badge */}
        <div className="mt-3">
          <span className="text-2xl font-extrabold" style={{ color: BLUE }}>
            {isPercent ? `${Number(r.value || 0)}%` : `₹${Number(r.value || 0).toFixed(0)}`}
          </span>
          <span className="text-xs text-slate-400 ml-1">{isPercent ? "off" : "flat off"}</span>
        </div>
      </div>

      {/* Dashed separator (ticket style) */}
      <div className="flex items-center px-2">
        <div className="w-4 h-4 rounded-full bg-slate-50 border border-slate-200 flex-shrink-0 -ml-2" />
        <div className="flex-1 border-t-2 border-dashed border-slate-200 mx-1" />
        <div className="w-4 h-4 rounded-full bg-slate-50 border border-slate-200 flex-shrink-0 -mr-2" />
      </div>

      {/* Bottom details */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {r.min_bill_amount > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Min ₹{Number(r.min_bill_amount).toFixed(0)}
            </span>
          )}
          {r.max_discount > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Cap ₹{Number(r.max_discount).toFixed(0)}
            </span>
          )}
        </div>

        {(r.start_date || r.end_date) && (
          <p className="text-[10px] text-slate-400">
            {r.start_date ? r.start_date : "—"} → {r.end_date ? r.end_date : "—"}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            !r.active ? "bg-slate-50 text-slate-400 border-slate-200"
            : expired ? "bg-red-50 text-red-500 border-red-100"
            : "bg-emerald-50 text-emerald-700 border-emerald-100"
          }`}>
            {!r.active ? "Inactive" : expired ? "Expired" : "Active"}
          </span>

          {r.active && canWrite && (
            <button
              onClick={onDisable}
              className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition"
            >
              Disable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
