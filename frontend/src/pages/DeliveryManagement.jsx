import { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";
const authAxios = () => axios.create({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

const STATUS_STYLE = {
  ASSIGNED:  { bg: "#dbeafe", color: "#1e40af", label: "Assigned" },
  PICKED_UP: { bg: "#fef3c7", color: "#92400e", label: "Picked Up" },
  DELIVERED: { bg: "#dcfce7", color: "#15803d", label: "Delivered" },
  FAILED:    { bg: "#fee2e2", color: "#b91c1c", label: "Failed" },
};

const NEXT_STATUS = {
  ASSIGNED: "PICKED_UP",
  PICKED_UP: "DELIVERED",
};

export default function DeliveryManagement() {
  const [assignments, setAssignments]   = useState([]);
  const [boys, setBoys]                 = useState([]);
  const [statusFilter, setStatusFilter] = useState("ASSIGNED");
  const [showBoyForm, setShowBoyForm]   = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [boyForm, setBoyForm]           = useState({ name: "", mobile: "" });
  const [assignForm, setAssignForm]     = useState({
    delivery_boy_id: "", customer_name: "", mobile: "", address: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const ax = authAxios();

  const load = async () => {
    try {
      const [asnRes, boyRes] = await Promise.all([
        ax.get(`${API}/api/delivery/assignments`, { params: { status: statusFilter !== "ALL" ? statusFilter : undefined } }),
        ax.get(`${API}/api/delivery/boys`),
      ]);
      setAssignments(asnRes.data || []);
      setBoys(boyRes.data || []);
    } catch { /* silent */ }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const saveBoy = async () => {
    if (!boyForm.name.trim()) return alert("Name required");
    if (!boyForm.mobile.trim()) return alert("Mobile required");
    setSaving(true);
    try {
      await ax.post(`${API}/api/delivery/boys`, boyForm);
      setBoyForm({ name: "", mobile: "" });
      setShowBoyForm(false);
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const saveAssignment = async () => {
    if (!assignForm.delivery_boy_id) return alert("Select a delivery boy");
    setSaving(true);
    try {
      await ax.post(`${API}/api/delivery/assignments`, assignForm);
      setAssignForm({ delivery_boy_id: "", customer_name: "", mobile: "", address: "", notes: "" });
      setShowAssignForm(false);
      setStatusFilter("ASSIGNED");
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await ax.put(`${API}/api/delivery/assignments/${id}/status`, { status: newStatus });
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Update failed");
    }
  };

  const toggleBoyActive = async (boyId, current) => {
    try {
      await ax.put(`${API}/api/delivery/boys/${boyId}`, { is_active: !current });
      load();
    } catch { alert("Update failed"); }
  };

  const counts = Object.keys(STATUS_STYLE).reduce((acc, s) => {
    acc[s] = assignments.filter((a) => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Delivery Management</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowBoyForm(true)}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold px-4 py-2 rounded text-sm">
            + Add Delivery Boy
          </button>
          <button onClick={() => setShowAssignForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm">
            + Assign Delivery
          </button>
        </div>
      </div>

      {/* Delivery Boys strip */}
      <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-gray-500 mr-2">DELIVERY BOYS:</span>
        {boys.length === 0 ? (
          <span className="text-sm text-gray-400">No delivery boys added yet</span>
        ) : boys.map((b) => (
          <div key={b.delivery_boy_id}
            className="flex items-center gap-2 border rounded-full px-3 py-1"
            style={{ background: b.is_active ? "#dcfce7" : "#f3f4f6", borderColor: b.is_active ? "#16a34a" : "#d1d5db" }}>
            <span className="text-sm font-semibold" style={{ color: b.is_active ? "#15803d" : "#6b7280" }}>
              {b.name}
            </span>
            <span className="text-xs text-gray-400">{b.mobile}</span>
            <button onClick={() => toggleBoyActive(b.delivery_boy_id, b.is_active)}
              className="text-xs text-gray-400 hover:text-gray-600 ml-1">
              {b.is_active ? "⏸" : "▶"}
            </button>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[["ALL", "All"], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <button key={k}
            onClick={() => setStatusFilter(k)}
            className={`px-4 py-2 rounded font-semibold text-sm ${statusFilter === k ? "bg-gray-800 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {label} {k !== "ALL" && counts[k] !== undefined ? `(${counts[k]})` : ""}
          </button>
        ))}
      </div>

      {/* Assignments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {assignments.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-16 text-lg">
            No deliveries found
          </div>
        ) : assignments.map((a) => {
          const st = STATUS_STYLE[a.status] || STATUS_STYLE.ASSIGNED;
          const nextStatus = NEXT_STATUS[a.status];
          return (
            <div key={a.assignment_id} className="bg-white rounded-lg shadow p-4 border-l-4"
              style={{ borderLeftColor: st.color }}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">{a.customer_name || "—"}</div>
                  <div className="text-sm text-gray-500">{a.mobile || "—"}</div>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded"
                  style={{ background: st.bg, color: st.color }}>
                  {st.label}
                </span>
              </div>

              {a.address && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mb-2">
                  📍 {a.address}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                  {a.delivery_boy_name?.[0] || "?"}
                </div>
                <div>
                  <div className="text-sm font-semibold">{a.delivery_boy_name || "—"}</div>
                  <div className="text-xs text-gray-400">{a.delivery_boy_mobile || ""}</div>
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-3">
                Assigned: {a.assigned_at ? new Date(a.assigned_at).toLocaleTimeString() : "—"}
                {a.picked_up_at && ` · Picked: ${new Date(a.picked_up_at).toLocaleTimeString()}`}
                {a.delivered_at && ` · Delivered: ${new Date(a.delivered_at).toLocaleTimeString()}`}
              </div>

              {a.notes && (
                <div className="text-xs text-amber-600 mb-2">📝 {a.notes}</div>
              )}

              {nextStatus && (
                <button onClick={() => updateStatus(a.assignment_id, nextStatus)}
                  className="w-full py-2 rounded text-sm font-semibold text-white"
                  style={{ background: STATUS_STYLE[nextStatus].color }}>
                  Mark as {STATUS_STYLE[nextStatus].label}
                </button>
              )}
              {a.status === "ASSIGNED" && (
                <button onClick={() => updateStatus(a.assignment_id, "FAILED")}
                  className="w-full mt-1 py-1 rounded text-xs font-semibold border border-red-300 text-red-500 hover:bg-red-50">
                  Mark Failed
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Delivery Boy Modal */}
      {showBoyForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Add Delivery Boy</h2>
              <button onClick={() => setShowBoyForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <input value={boyForm.name} onChange={(e) => setBoyForm({ ...boyForm, name: e.target.value })}
                placeholder="Full name *" className="border rounded px-3 py-2 text-sm" />
              <input value={boyForm.mobile} onChange={(e) => setBoyForm({ ...boyForm, mobile: e.target.value })}
                placeholder="Mobile *" className="border rounded px-3 py-2 text-sm" />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setShowBoyForm(false)}
                  className="flex-1 border rounded py-2 text-sm font-semibold text-gray-600">Cancel</button>
                <button onClick={saveBoy} disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded py-2 text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving..." : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Delivery Modal */}
      {showAssignForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Assign Delivery</h2>
              <button onClick={() => setShowAssignForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm font-semibold text-gray-600">Delivery Boy *</label>
                <select value={assignForm.delivery_boy_id}
                  onChange={(e) => setAssignForm({ ...assignForm, delivery_boy_id: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm">
                  <option value="">Select delivery boy...</option>
                  {boys.map((b) => (
                    <option key={b.delivery_boy_id} value={b.delivery_boy_id}>{b.name} — {b.mobile}</option>
                  ))}
                </select>
              </div>
              <input value={assignForm.customer_name}
                onChange={(e) => setAssignForm({ ...assignForm, customer_name: e.target.value })}
                placeholder="Customer name" className="border rounded px-3 py-2 text-sm" />
              <input value={assignForm.mobile}
                onChange={(e) => setAssignForm({ ...assignForm, mobile: e.target.value })}
                placeholder="Customer mobile" className="border rounded px-3 py-2 text-sm" />
              <textarea value={assignForm.address}
                onChange={(e) => setAssignForm({ ...assignForm, address: e.target.value })}
                placeholder="Delivery address" rows={3}
                className="border rounded px-3 py-2 text-sm resize-none" />
              <input value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                placeholder="Notes (optional)" className="border rounded px-3 py-2 text-sm" />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setShowAssignForm(false)}
                  className="flex-1 border rounded py-2 text-sm font-semibold text-gray-600">Cancel</button>
                <button onClick={saveAssignment} disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded py-2 text-sm font-semibold disabled:opacity-50">
                  {saving ? "Assigning..." : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
