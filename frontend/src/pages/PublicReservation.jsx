import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";
const today = () => new Date().toISOString().split("T")[0];

const inputCls =
  "border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";

const STEPS = { FORM: "form", SUCCESS: "success", NOT_FOUND: "not_found" };

export default function PublicReservation() {
  const [params] = useSearchParams();
  const shopId = params.get("shop");
  const defaultBranch = params.get("branch");

  const [step, setStep] = useState(STEPS.FORM);
  const [shopInfo, setShopInfo] = useState(null);
  const [tables, setTables] = useState([]);
  const [loadingShop, setLoadingShop] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const [form, setForm] = useState({
    customer_name: "",
    mobile: "",
    email: "",
    branch_id: defaultBranch || "",
    table_id: "",
    reservation_date: today(),
    reservation_time: "19:00",
    guests: 2,
    notes: "",
  });

  const [errors, setErrors] = useState({});

  // Load shop info
  useEffect(() => {
    if (!shopId) {
      setLoadingShop(false);
      setStep(STEPS.NOT_FOUND);
      return;
    }
    axios
      .get(`${API}/api/public/reservations/shop-info?shop_id=${shopId}`)
      .then((r) => {
        setShopInfo(r.data);
        // Auto-select branch if only one or defaultBranch set
        const branches = r.data?.branches || [];
        if (defaultBranch) {
          setForm((f) => ({ ...f, branch_id: defaultBranch }));
        } else if (branches.length === 1) {
          setForm((f) => ({ ...f, branch_id: String(branches[0].branch_id) }));
        }
      })
      .catch(() => setStep(STEPS.NOT_FOUND))
      .finally(() => setLoadingShop(false));
  }, [shopId]);

  // Load tables when branch changes
  useEffect(() => {
    if (!shopId || !form.branch_id) { setTables([]); return; }
    axios
      .get(`${API}/api/public/reservations/tables?shop_id=${shopId}&branch_id=${form.branch_id}`)
      .then((r) => setTables(r.data || []))
      .catch(() => setTables([]));
  }, [shopId, form.branch_id]);

  const validate = () => {
    const e = {};
    if (!form.customer_name.trim()) e.customer_name = "Name is required";
    if (!form.mobile.trim()) e.mobile = "Mobile is required";
    else if (!/^\d{7,15}$/.test(form.mobile.trim())) e.mobile = "Enter a valid mobile number";
    if (!form.reservation_date) e.reservation_date = "Date is required";
    else if (form.reservation_date < today()) e.reservation_date = "Date cannot be in the past";
    if (!form.reservation_time) e.reservation_time = "Time is required";
    if (!form.branch_id) e.branch_id = "Please select a branch";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/public/reservations/`, {
        shop_id: parseInt(shopId),
        branch_id: parseInt(form.branch_id),
        table_id: form.table_id ? parseInt(form.table_id) : null,
        customer_name: form.customer_name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || null,
        reservation_date: form.reservation_date,
        reservation_time: form.reservation_time,
        guests: parseInt(form.guests) || 1,
        notes: form.notes.trim() || null,
      });
      setConfirmation(res.data);
      setStep(STEPS.SUCCESS);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Booking failed. Please try again.";
      setErrors({ submit: msg });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      customer_name: "", mobile: "", email: "",
      branch_id: defaultBranch || (shopInfo?.branches?.length === 1 ? String(shopInfo.branches[0].branch_id) : ""),
      table_id: "", reservation_date: today(), reservation_time: "19:00", guests: 2, notes: "",
    });
    setErrors({});
    setConfirmation(null);
    setStep(STEPS.FORM);
  };

  // ── Loading ──────────────────────────────────────────────
  if (loadingShop) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────
  if (step === STEPS.NOT_FOUND) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔍</div>
          <h1 className="text-lg font-bold text-gray-800">Booking link not found</h1>
          <p className="text-sm text-gray-500">The reservation page you're looking for doesn't exist or the link may be invalid. Please contact the restaurant directly.</p>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────
  if (step === STEPS.SUCCESS && confirmation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Booking Confirmed!</h1>
            <p className="text-sm text-gray-500 mt-1">We've received your reservation request.</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-semibold text-gray-800">{confirmation.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold text-gray-800">{confirmation.reservation_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Time</span>
              <span className="font-semibold text-gray-800">{confirmation.reservation_time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Guests</span>
              <span className="font-semibold text-gray-800">{confirmation.guests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold text-amber-600">Pending Confirmation</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">The restaurant will confirm your booking shortly. Please arrive on time.</p>
          <button
            onClick={resetForm}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
          >
            Make Another Booking
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────
  const branches = shopInfo?.branches || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-start justify-center p-4 py-10">
      <div className="w-full max-w-lg">
        {/* Shop Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center mx-auto mb-3 text-2xl">🍽</div>
          <h1 className="text-xl font-bold text-gray-900">{shopInfo?.shop_name || "Table Reservation"}</h1>
          {shopInfo?.address && <p className="text-[12px] text-gray-500 mt-1">{shopInfo.address}</p>}
          <p className="text-[12px] text-blue-600 font-medium mt-1">Reserve Your Table</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">

          {/* Branch */}
          {branches.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Branch / Location *</label>
              <select
                className={`${inputCls} ${errors.branch_id ? "border-rose-400" : ""}`}
                value={form.branch_id}
                onChange={e => setForm({ ...form, branch_id: e.target.value, table_id: "" })}
              >
                <option value="">Select location...</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                ))}
              </select>
              {errors.branch_id && <p className="text-[11px] text-rose-500">{errors.branch_id}</p>}
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Date *</label>
              <input
                type="date"
                className={`${inputCls} ${errors.reservation_date ? "border-rose-400" : ""}`}
                min={today()}
                value={form.reservation_date}
                onChange={e => setForm({ ...form, reservation_date: e.target.value })}
              />
              {errors.reservation_date && <p className="text-[11px] text-rose-500">{errors.reservation_date}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Time *</label>
              <input
                type="time"
                className={`${inputCls} ${errors.reservation_time ? "border-rose-400" : ""}`}
                value={form.reservation_time}
                onChange={e => setForm({ ...form, reservation_time: e.target.value })}
              />
              {errors.reservation_time && <p className="text-[11px] text-rose-500">{errors.reservation_time}</p>}
            </div>
          </div>

          {/* Guests */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Number of Guests *</label>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm({ ...form, guests: n })}
                  className={`w-9 h-9 rounded-xl text-[13px] font-semibold border transition flex-shrink-0 ${
                    form.guests === n
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={99}
                className="border border-gray-200 rounded-xl px-2 py-1.5 text-[13px] bg-gray-50 focus:outline-none w-16"
                placeholder="9+"
                value={form.guests > 8 ? form.guests : ""}
                onChange={e => setForm({ ...form, guests: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          {/* Name & Mobile */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Your Name *</label>
              <input
                className={`${inputCls} ${errors.customer_name ? "border-rose-400" : ""}`}
                placeholder="Full name"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
              />
              {errors.customer_name && <p className="text-[11px] text-rose-500">{errors.customer_name}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Mobile *</label>
              <input
                type="tel"
                className={`${inputCls} ${errors.mobile ? "border-rose-400" : ""}`}
                placeholder="Mobile number"
                value={form.mobile}
                onChange={e => setForm({ ...form, mobile: e.target.value })}
              />
              {errors.mobile && <p className="text-[11px] text-rose-500">{errors.mobile}</p>}
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Email (optional)</label>
            <input
              type="email"
              className={inputCls}
              placeholder="your@email.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>

          {/* Table preference */}
          {tables.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Table Preference (optional)</label>
              <select
                className={inputCls}
                value={form.table_id}
                onChange={e => setForm({ ...form, table_id: e.target.value })}
              >
                <option value="">No preference</option>
                {tables.map(t => (
                  <option key={t.table_id} value={t.table_id}>
                    {t.table_name}{t.capacity ? ` (seats ${t.capacity})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Special requests */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Special Requests (optional)</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Dietary needs, allergies, celebrations..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {/* Submit error */}
          {errors.submit && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-[12px] text-rose-700">
              {errors.submit}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-3 rounded-xl text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 shadow-sm"
          >
            {saving ? "Booking..." : "Confirm Reservation"}
          </button>

          <p className="text-center text-[11px] text-gray-400">
            Your booking will be confirmed by the restaurant. No payment required now.
          </p>
        </div>

        {shopInfo?.mobile && (
          <p className="text-center text-[11px] text-gray-500 mt-4">
            Questions? Call us at <span className="font-semibold text-gray-700">{shopInfo.mobile}</span>
          </p>
        )}
      </div>
    </div>
  );
}
