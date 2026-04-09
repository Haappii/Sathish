import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { FaPlus, FaEdit, FaTrash, FaEnvelope, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { MdScheduleSend } from "react-icons/md";

const BLUE = "#0B3C8C";

const inputCls =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

const REPORT_TYPES = [
  { value: "daily_sales", label: "Daily Sales Summary",  desc: "Total bills, amount & tax per branch" },
  { value: "item_sales",  label: "Item-Wise Sales",      desc: "Quantity & revenue per item"          },
  { value: "gst_summary", label: "GST Summary",          desc: "Tax collected, gross & net totals"    },
];

const EMPTY = { id: null, name: "", report_type: "daily_sales", send_time: "08:00", recipient_email: "" };

export default function MailScheduler() {
  const { showToast } = useToast();
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    try {
      const res = await authAxios.get("/mail-scheduler/");
      setList(res.data || []);
    } catch {
      showToast("Failed to load schedulers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setShowForm(true); };
  const openEdit   = s  => {
    setForm({ id: s.id, name: s.name, report_type: s.report_type,
              send_time: s.send_time, recipient_email: s.recipient_email });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim())            return showToast("Name is required", "error");
    if (!form.recipient_email.trim()) return showToast("Email is required", "error");
    setSaving(true);
    try {
      if (form.id) {
        await authAxios.put(`/mail-scheduler/${form.id}`, form);
        showToast("Scheduler updated", "success");
      } else {
        await authAxios.post("/mail-scheduler/", form);
        showToast("Scheduler created", "success");
      }
      setShowForm(false);
      load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async s => {
    try {
      await authAxios.put(`/mail-scheduler/${s.id}`, { is_active: !s.is_active });
      showToast(s.is_active ? "Paused" : "Enabled", "success");
      load();
    } catch { showToast("Update failed", "error"); }
  };

  const remove = async s => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try {
      await authAxios.delete(`/mail-scheduler/${s.id}`);
      showToast("Deleted", "success");
      load();
    } catch { showToast("Delete failed", "error"); }
  };

  const reportLabel = v => REPORT_TYPES.find(r => r.value === v)?.label || v;
  const active = list.filter(s => s.is_active).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdScheduleSend size={18} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Mail Report Scheduler</h1>
              <p className="text-xs text-slate-500">
                {list.length} scheduler{list.length !== 1 ? "s" : ""} · {active} active
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition"
            style={{ background: BLUE }}
          >
            <FaPlus size={11} /> New Scheduler
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-6 mt-5 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-start gap-3">
        <FaEnvelope size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Reports cover <strong>yesterday's</strong> data and are sent as a CSV attachment at your chosen time daily.
          Uses the same email account configured in Support settings.
        </p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400">Loading…</div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <MdScheduleSend size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No schedulers yet</p>
            <p className="text-xs text-slate-400 mt-1">Create one to start sending automated reports</p>
            <button
              onClick={openCreate}
              className="mt-4 px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition"
              style={{ background: BLUE }}
            >
              + New Scheduler
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map(s => (
              <div
                key={s.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition
                  ${s.is_active ? "border-slate-200" : "border-slate-100 opacity-60"}`}
              >
                {/* Card top accent */}
                <div className="h-1 w-full" style={{ background: s.is_active ? BLUE : "#cbd5e1" }} />

                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{reportLabel(s.report_type)}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${s.is_active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                      {s.is_active ? "Active" : "Paused"}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">⏰</span>
                      <span>Sends daily at <strong className="text-slate-800">{s.send_time}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FaEnvelope size={10} className="text-slate-400 shrink-0" />
                      <span className="truncate text-slate-600">{s.recipient_email}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100">
                    <button
                      onClick={() => openEdit(s)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center justify-center gap-1"
                    >
                      <FaEdit size={10} /> Edit
                    </button>
                    <button
                      onClick={() => toggle(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1
                        ${s.is_active
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                    >
                      {s.is_active
                        ? <><FaToggleOff size={11} /> Pause</>
                        : <><FaToggleOn size={11} /> Enable</>}
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="py-1.5 px-3 rounded-lg text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition flex items-center justify-center"
                    >
                      <FaTrash size={10} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                {form.id
                  ? <FaEdit size={14} style={{ color: BLUE }} />
                  : <MdScheduleSend size={16} style={{ color: BLUE }} />}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{form.id ? "Edit Scheduler" : "New Scheduler"}</h3>
                <p className="text-xs text-slate-500">Configure automated report email</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  className={inputCls}
                  placeholder="e.g. Morning Sales Report"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              {/* Report type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Report Type</label>
                <select
                  className={inputCls}
                  value={form.report_type}
                  onChange={e => setForm({ ...form, report_type: e.target.value })}
                >
                  {REPORT_TYPES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  {REPORT_TYPES.find(r => r.value === form.report_type)?.desc}
                </p>
              </div>

              {/* Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Send Time (daily)</label>
                <input
                  type="time"
                  className={inputCls}
                  value={form.send_time}
                  onChange={e => setForm({ ...form, send_time: e.target.value })}
                />
                <p className="text-[11px] text-slate-400">Report will be sent at this time every day</p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Recipient Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="owner@example.com"
                  value={form.recipient_email}
                  onChange={e => setForm({ ...form, recipient_email: e.target.value })}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
                style={{ background: BLUE }}
              >
                {saving ? "Saving…" : form.id ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
