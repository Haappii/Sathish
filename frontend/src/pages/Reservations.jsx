import { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";
const authAxios = () => axios.create({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

const STATUS_STYLE = {
  PENDING:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  CONFIRMED: { bg: "#dbeafe", color: "#1e40af", label: "Confirmed" },
  SEATED:    { bg: "#dcfce7", color: "#15803d", label: "Seated" },
  CANCELLED: { bg: "#fee2e2", color: "#b91c1c", label: "Cancelled" },
  NO_SHOW:   { bg: "#f3f4f6", color: "#4b5563", label: "No Show" },
};

const today = () => new Date().toISOString().split("T")[0];

export default function Reservations() {
  const [rows, setRows]         = useState([]);
  const [tables, setTables]     = useState([]);
  const [date, setDate]         = useState(today());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({
    customer_name: "", mobile: "", email: "",
    table_id: "", reservation_date: today(),
    reservation_time: "19:00", guests: 2, notes: "",
  });
  const [saving, setSaving] = useState(false);

  const ax = authAxios();
  const branchId = localStorage.getItem("branch_id");

  const load = async () => {
    try {
      const [resRes, tblRes] = await Promise.all([
        ax.get(`${API}/api/reservations/`, { params: { reservation_date: date, branch_id: branchId } }),
        ax.get(`${API}/api/tables/branch/${branchId}`),
      ]);
      setRows(resRes.data || []);
      setTables(tblRes.data || []);
    } catch { /* silent */ }
  };

  useEffect(() => { load(); }, [date]);

  const filtered = statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter);

  const save = async () => {
    if (!form.customer_name.trim()) return alert("Customer name required");
    if (!form.mobile.trim()) return alert("Mobile required");
    setSaving(true);
    try {
      await ax.post(`${API}/api/reservations/`, { ...form, branch_id: parseInt(branchId) });
      setShowForm(false);
      setForm({ customer_name: "", mobile: "", email: "", table_id: "", reservation_date: today(), reservation_time: "19:00", guests: 2, notes: "" });
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status, cancel_reason = "") => {
    try {
      await ax.put(`${API}/api/reservations/${id}/status`, { status, cancel_reason });
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Failed to update");
    }
  };

  const confirmDelete = async (id) => {
    if (!window.confirm("Delete this reservation?")) return;
    try {
      await ax.delete(`${API}/api/reservations/${id}`);
      load();
    } catch { alert("Failed to delete"); }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Table Reservations</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="ALL">All Status</option>
            {Object.entries(STATUS_STYLE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm"
          >
            + New Reservation
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {Object.entries(STATUS_STYLE).map(([k, v]) => (
          <div key={k} className="rounded-lg p-3 text-center cursor-pointer"
            style={{ background: v.bg, border: `1px solid ${v.color}33` }}
            onClick={() => setStatusFilter(statusFilter === k ? "ALL" : k)}
          >
            <div className="font-bold text-xl" style={{ color: v.color }}>
              {rows.filter((r) => r.status === k).length}
            </div>
            <div className="text-xs font-semibold" style={{ color: v.color }}>{v.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              {["Time", "Customer", "Mobile", "Table", "Guests", "Notes", "Status", "Actions"].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-gray-400 py-12">No reservations found</td></tr>
            ) : filtered.map((r, i) => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.PENDING;
              const table = tables.find((t) => t.table_id === r.table_id);
              return (
                <tr key={r.reservation_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-3 font-bold">{r.reservation_time}</td>
                  <td className="px-3 py-3 font-semibold">{r.customer_name}</td>
                  <td className="px-3 py-3 text-gray-600">{r.mobile}</td>
                  <td className="px-3 py-3">{table ? table.table_name : (r.table_id ? `#${r.table_id}` : "—")}</td>
                  <td className="px-3 py-3 text-center">{r.guests}</td>
                  <td className="px-3 py-3 text-gray-500 max-w-[150px] truncate">{r.notes || "—"}</td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-1 rounded text-xs font-bold"
                      style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {r.status === "PENDING" && (
                        <button onClick={() => updateStatus(r.reservation_id, "CONFIRMED")}
                          className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded font-semibold">
                          Confirm
                        </button>
                      )}
                      {r.status === "CONFIRMED" && (
                        <button onClick={() => updateStatus(r.reservation_id, "SEATED")}
                          className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded font-semibold">
                          Seated
                        </button>
                      )}
                      {["PENDING", "CONFIRMED"].includes(r.status) && (
                        <>
                          <button onClick={() => updateStatus(r.reservation_id, "NO_SHOW")}
                            className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1 rounded font-semibold">
                            No Show
                          </button>
                          <button onClick={() => {
                            const reason = window.prompt("Cancel reason (optional):");
                            if (reason !== null) updateStatus(r.reservation_id, "CANCELLED", reason);
                          }}
                            className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded font-semibold">
                            Cancel
                          </button>
                        </>
                      )}
                      <button onClick={() => confirmDelete(r.reservation_id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-1 py-1 rounded">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Reservation Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">New Reservation</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-semibold text-gray-600">Customer Name *</label>
                <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" placeholder="Enter name" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Mobile *</label>
                <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" placeholder="Mobile number" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Date *</label>
                <input type="date" value={form.reservation_date} onChange={(e) => setForm({ ...form, reservation_date: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Time *</label>
                <input type="time" value={form.reservation_time} onChange={(e) => setForm({ ...form, reservation_time: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Guests</label>
                <input type="number" min={1} value={form.guests} onChange={(e) => setForm({ ...form, guests: parseInt(e.target.value) })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Table (optional)</label>
                <select value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm">
                  <option value="">Not assigned</option>
                  {tables.filter((t) => t.status === "FREE").map((t) => (
                    <option key={t.table_id} value={t.table_id}>{t.table_name} (cap: {t.capacity})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-semibold text-gray-600">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full border rounded px-3 py-2 mt-1 text-sm resize-none"
                  placeholder="Special requests, dietary needs..." />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border rounded py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? "Saving..." : "Save Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
