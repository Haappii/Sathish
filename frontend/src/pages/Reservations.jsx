import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getBusinessDate } from "../utils/businessDate";

const today = () => getBusinessDate();

const STATUS = {
  PENDING:   { label: "Pending",   bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  CONFIRMED: { label: "Confirmed", bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"   },
  SEATED:    { label: "Seated",    bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  CANCELLED: { label: "Cancelled", bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"   },
  NO_SHOW:   { label: "No Show",   bg: "bg-gray-100",   text: "text-gray-600",    border: "border-gray-200"   },
};

const PAY_BADGE = {
  PAID:   { label: "Paid",          bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  UNPAID: { label: "Awaiting Pay",  bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200"  },
};

const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";
const BLUE = "#0B3C8C";

const EMPTY_FORM = {
  customer_name: "", mobile: "", email: "",
  table_id: "", reservation_date: today(),
  reservation_time: "19:00", guests: 2, notes: "",
};

export default function Reservations() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const branchId = session.branch_id || localStorage.getItem("branch_id");

  const [rows, setRows] = useState([]);
  const [tables, setTables] = useState([]);
  const [date, setDate] = useState(today());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null); // null = new, else row object
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [cancelModal, setCancelModal] = useState(null); // reservation_id or null
  const [cancelReason, setCancelReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [resRes, tblRes] = await Promise.all([
        authAxios.get("/reservations/", { params: { reservation_date: date, branch_id: branchId } }),
        authAxios.get(`/tables/branch/${branchId}`),
      ]);
      setRows(resRes.data || []);
      setTables(tblRes.data || []);
    } catch {
      showToast("Failed to load reservations", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  const filtered = statusFilter === "ALL" ? rows : rows.filter(r => r.status === statusFilter);

  const openNew = () => {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      customer_name: row.customer_name || "",
      mobile: row.mobile || "",
      email: row.email || "",
      table_id: row.table_id || "",
      reservation_date: row.reservation_date || today(),
      reservation_time: row.reservation_time || "19:00",
      guests: row.guests || 2,
      notes: row.notes || "",
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditRow(null); };

  const save = async () => {
    if (!form.customer_name.trim()) return showToast("Customer name required", "error");
    if (!form.mobile.trim()) return showToast("Mobile required", "error");
    setSaving(true);
    try {
      if (editRow) {
        await authAxios.put(`/reservations/${editRow.reservation_id}`, form);
        showToast("Reservation updated", "success");
      } else {
        await authAxios.post("/reservations/", { ...form, branch_id: parseInt(branchId) });
        showToast("Reservation created", "success");
      }
      closeForm();
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status, cancel_reason = "") => {
    try {
      await authAxios.put(`/reservations/${id}/status`, { status, cancel_reason });
      showToast(`Marked as ${STATUS[status]?.label || status}`, "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to update", "error");
    }
  };

  const deleteRow = async (id) => {
    try {
      await authAxios.delete(`/reservations/${id}`);
      showToast("Reservation deleted", "success");
      load();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const submitCancel = async () => {
    if (!cancelModal) return;
    await updateStatus(cancelModal, "CANCELLED", cancelReason);
    setCancelModal(null);
    setCancelReason("");
  };

  const counts = Object.keys(STATUS).reduce((acc, k) => {
    acc[k] = rows.filter(r => r.status === k).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Table Reservations</h1>
          <p className="text-[11px] text-gray-400">{filtered.length} reservation{filtered.length !== 1 ? "s" : ""} · {date}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none"
          />
          <button
            onClick={load}
            className="px-4 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Refresh
          </button>
          <button
            onClick={openNew}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white transition"
            style={{ backgroundColor: BLUE }}
          >
            + New Reservation
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Status Summary Cards */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Object.entries(STATUS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(statusFilter === k ? "ALL" : k)}
              className={`bg-white border rounded-2xl shadow-sm p-3 text-left transition hover:shadow-md ${
                statusFilter === k ? `${v.border} ring-1 ring-inset ring-current` : "border-gray-100"
              }`}
            >
              <p className={`text-xl font-bold ${v.text}`}>{counts[k] || 0}</p>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${v.text}`}>{v.label}</p>
            </button>
          ))}
        </div>

        {/* Status Filter Pills */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1 rounded-xl text-[11px] font-semibold border transition ${
              statusFilter === "ALL" ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
            style={statusFilter === "ALL" ? { backgroundColor: BLUE } : {}}
          >
            All ({rows.length})
          </button>
          {Object.entries(STATUS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(statusFilter === k ? "ALL" : k)}
              className={`px-3 py-1 rounded-xl text-[11px] font-semibold border transition ${
                statusFilter === k ? `${v.bg} ${v.text} ${v.border}` : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading reservations...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-sm text-gray-400">No reservations for {date}</p>
              <button onClick={openNew} className="text-[12px] font-semibold underline" style={{ color: BLUE }}>Add one</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {["Time", "Customer", "Mobile", "Table", "Guests", "Notes", "Status", "Payment", "Actions"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] ${i >= 3 && i <= 4 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r, idx) => {
                    const st = STATUS[r.status] || STATUS.PENDING;
                    const table = tables.find(t => t.table_id === r.table_id);
                    return (
                      <tr key={r.reservation_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-3 font-bold text-gray-800">{r.reservation_time}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{r.customer_name}</p>
                          {r.email && <p className="text-[10px] text-gray-400">{r.email}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.mobile}</td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {table ? table.table_name : (r.table_id ? `#${r.table_id}` : "—")}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{r.guests}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">{r.notes || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const pb = PAY_BADGE[r.payment_status] || PAY_BADGE.UNPAID;
                            return (
                              <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${pb.bg} ${pb.text} ${pb.border}`}>
                                {pb.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap items-center">
                            {r.status === "PENDING" && r.payment_status === "PAID" && (
                              <button
                                onClick={() => updateStatus(r.reservation_id, "CONFIRMED")}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition"
                              >
                                Approve
                              </button>
                            )}
                            {r.status === "PENDING" && r.payment_status !== "PAID" && (
                              <button
                                onClick={() => updateStatus(r.reservation_id, "CONFIRMED")}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
                                title="Payment not yet confirmed"
                              >
                                Confirm
                              </button>
                            )}
                            {r.status === "CONFIRMED" && (
                              <button
                                onClick={() => updateStatus(r.reservation_id, "SEATED")}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                              >
                                Seated
                              </button>
                            )}
                            {["PENDING", "CONFIRMED"].includes(r.status) && (
                              <>
                                <button
                                  onClick={() => updateStatus(r.reservation_id, "NO_SHOW")}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition"
                                >
                                  No Show
                                </button>
                                <button
                                  onClick={() => { setCancelModal(r.reservation_id); setCancelReason(""); }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => openEdit(r)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRow(r.reservation_id)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            >
                              ✕
                            </button>
                          </div>
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

      {/* New / Edit Reservation Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">{editRow ? "Edit Reservation" : "New Reservation"}</h2>
              <button onClick={closeForm} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-lg leading-none transition">×</button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className={labelCls}>Customer Name *</label>
                <input className={inputCls} placeholder="Enter name" value={form.customer_name}
                  onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Mobile *</label>
                <input className={inputCls} placeholder="Mobile number" value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Email</label>
                <input className={inputCls} placeholder="Optional" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Date *</label>
                <input type="date" className={inputCls} value={form.reservation_date}
                  onChange={e => setForm({ ...form, reservation_date: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Time *</label>
                <input type="time" className={inputCls} value={form.reservation_time}
                  onChange={e => setForm({ ...form, reservation_time: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Guests</label>
                <input type="number" min={1} className={inputCls} value={form.guests}
                  onChange={e => setForm({ ...form, guests: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Table (optional)</label>
                <select className={inputCls} value={form.table_id}
                  onChange={e => setForm({ ...form, table_id: e.target.value })}>
                  <option value="">Not assigned</option>
                  {tables.filter(t => t.status === "FREE" || t.table_id === form.table_id).map(t => (
                    <option key={t.table_id} value={t.table_id}>{t.table_name} (cap: {t.capacity})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} resize-none`} rows={2}
                  placeholder="Special requests, dietary needs..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={closeForm}
                className="flex-1 border border-gray-200 rounded-xl py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold text-white transition disabled:opacity-60"
                style={{ backgroundColor: BLUE }}>
                {saving ? "Saving..." : editRow ? "Update Reservation" : "Save Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reason Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-800">Cancel Reservation</h2>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Reason (optional)</label>
              <input className={inputCls} placeholder="Why is it being cancelled?"
                value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setCancelModal(null); setCancelReason(""); }}
                className="flex-1 border border-gray-200 rounded-xl py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                Back
              </button>
              <button onClick={submitCancel}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 transition">
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
