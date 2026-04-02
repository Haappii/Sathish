import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

const BLUE = "#0B3C8C";

const emptyForm = {
  customer_id: null,
  customer_name: "",
  mobile: "",
  email: "",
  gst_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  status: "ACTIVE"
};

function Avatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
  ];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${colors[idx]}`}>
      {initials}
    </div>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const canManage = roleLower === "admin" || roleLower === "manager";

  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [duesLoading, setDuesLoading] = useState(false);
  const [dues, setDues] = useState([]);

  const isEditing = !!form.customer_id;
  const selectedMobile = useMemo(() => (form?.mobile || "").trim(), [form?.mobile]);

  const totalOutstanding = useMemo(
    () => dues.reduce((s, d) => s + Number(d.outstanding_amount || 0), 0),
    [dues]
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/customers/search", {
        params: { q: q || undefined, limit: 200 }
      });
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load customers";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const loadDues = async (mobile) => {
    if (!mobile || String(mobile).replace(/\D/g, "").length < 10) {
      setDues([]);
      return;
    }
    setDuesLoading(true);
    try {
      const res = await authAxios.get("/dues/open", { params: { q: mobile } });
      setDues(res.data || []);
    } catch {
      setDues([]);
    } finally {
      setDuesLoading(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    load();
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    loadDues(selectedMobile);
  }, [selectedMobile, canManage]);

  const selectRow = (r) => {
    setForm({
      ...emptyForm,
      ...r,
      customer_id: r.customer_id ?? null,
      status: r.status || "ACTIVE"
    });
  };

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const reset = () => {
    setForm(emptyForm);
    setDues([]);
  };

  const save = async () => {
    if (!form.customer_name?.trim()) return showToast("Customer name required", "error");
    if (!form.mobile?.trim()) return showToast("Mobile required", "error");

    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name?.trim(),
        mobile: form.mobile?.trim(),
        email: form.email?.trim() || null,
        gst_number: form.gst_number?.trim() || null,
        address_line1: form.address_line1?.trim() || null,
        address_line2: form.address_line2?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        pincode: form.pincode?.trim() || null,
        status: form.status || "ACTIVE"
      };

      const res = await authAxios.post("/customers/", payload);
      const saved = res?.data || null;
      showToast("Customer saved", "success");
      if (saved) selectRow(saved);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Save failed";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-red-100 rounded-2xl shadow-sm px-10 py-8 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm font-semibold text-red-600">Access Denied</div>
          <div className="text-xs text-gray-500 mt-1">You are not authorized to access this page</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Page Header ── */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Customers</h1>
          <p className="text-[11px] text-gray-400">{rows.length} customer{rows.length !== 1 ? "s" : ""} found</p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white shadow-sm transition"
          style={{ backgroundColor: BLUE }}
        >
          + New Customer
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4 grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">

        {/* ── LEFT: Search + List ── */}
        <div className="flex flex-col gap-3">

          {/* Search bar */}
          <div className="bg-white border rounded-2xl shadow-sm px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
              placeholder="Search by name or mobile..."
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load()}
            />
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1 rounded-lg text-xs font-semibold text-white transition"
              style={{ backgroundColor: BLUE }}
            >
              {loading ? "..." : "Search"}
            </button>
          </div>

          {/* Customer list */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading customers...</div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <div className="text-2xl">👥</div>
                <div className="text-sm text-gray-400">No customers found</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[600px] w-full text-left text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Customer</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Mobile</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">GST No.</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">City</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => {
                      const isSelected = form.customer_id === r.customer_id;
                      return (
                        <tr
                          key={r.customer_id}
                          onClick={() => selectRow(r)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-blue-50" : "hover:bg-gray-50/70"
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.customer_name} />
                              <div>
                                <div className="font-semibold text-gray-800">{r.customer_name}</div>
                                {r.email && <div className="text-[10px] text-gray-400">{r.email}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{r.mobile}</td>
                          <td className="px-4 py-2.5 text-gray-500">{r.gst_number || "—"}</td>
                          <td className="px-4 py-2.5 text-gray-500">{r.city || "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {r.status || "ACTIVE"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Customer Form + Dues ── */}
        <div className="flex flex-col gap-3">

          {/* Form card */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            {/* Form header */}
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #fff 100%)" }}>
              <div>
                <div className="text-sm font-bold text-gray-800">
                  {isEditing ? "Edit Customer" : "New Customer"}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {isEditing ? `ID #${form.customer_id}` : "Fill in the details below"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    onClick={reset}
                    className="px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
                  style={{ backgroundColor: "#059669" }}
                >
                  {saving ? "Saving..." : isEditing ? "Update" : "Save"}
                </button>
              </div>
            </div>

            {/* Form fields */}
            <div className="p-4 space-y-3">
              {/* Basic info */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Basic Info</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-gray-500 mb-0.5">Full Name <span className="text-red-400">*</span></label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="Customer name"
                      value={form.customer_name}
                      onChange={e => update({ customer_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Mobile <span className="text-red-400">*</span></label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="10-digit mobile"
                      value={form.mobile}
                      onChange={e => update({ mobile: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Email</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="email@example.com"
                      value={form.email || ""}
                      onChange={e => update({ email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">GST Number</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="GSTIN"
                      value={form.gst_number || ""}
                      onChange={e => update({ gst_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Status</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      value={form.status || "ACTIVE"}
                      onChange={e => update({ status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Address</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-gray-500 mb-0.5">Address Line 1</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="Street, building..."
                      value={form.address_line1 || ""}
                      onChange={e => update({ address_line1: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-gray-500 mb-0.5">Address Line 2</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="Landmark, area..."
                      value={form.address_line2 || ""}
                      onChange={e => update({ address_line2: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">City</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="City"
                      value={form.city || ""}
                      onChange={e => update({ city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">State</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="State"
                      value={form.state || ""}
                      onChange={e => update({ state: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Pincode</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      placeholder="Pincode"
                      value={form.pincode || ""}
                      onChange={e => update({ pincode: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dues card */}
          {isEditing && (
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-800">Open Dues</div>
                  {dues.length > 0 && (
                    <div className="text-[10px] text-rose-500 font-semibold mt-0.5">
                      Outstanding: ₹{totalOutstanding.toFixed(2)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => loadDues(selectedMobile)}
                  disabled={duesLoading}
                  className="px-3 py-1.5 rounded-xl border text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {duesLoading ? "Loading..." : "↻ Refresh"}
                </button>
              </div>

              <div className="p-4">
                {duesLoading ? (
                  <div className="text-[12px] text-gray-400 text-center py-4">Loading dues...</div>
                ) : dues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-1">
                    <div className="text-2xl">✅</div>
                    <div className="text-[12px] text-gray-400">No open dues for this customer</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[400px] w-full text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 rounded-lg">
                          <th className="px-2 py-2 text-left font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Invoice</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Original</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Paid</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dues.map(d => (
                          <tr key={d.due_id} className="hover:bg-gray-50/60">
                            <td className="px-2 py-2 font-semibold text-gray-800">{d.invoice_number}</td>
                            <td className="px-2 py-2 text-right text-gray-600">₹{Number(d.original_amount || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-emerald-600">₹{Number(d.paid_amount || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right font-bold text-rose-600">₹{Number(d.outstanding_amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td colSpan={3} className="px-2 py-2 text-right text-[11px] font-semibold text-gray-600">Total Outstanding</td>
                          <td className="px-2 py-2 text-right font-bold text-rose-600">₹{totalOutstanding.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
