import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { getSession, clearSession } from "../utils/auth";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import { FaMoon, FaCheckCircle, FaCircle } from "react-icons/fa";
import { MdStorefront } from "react-icons/md";

const BLUE = "#0B3C8C";

export default function DayClose() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const role = (session.role || session.role_name || "").toLowerCase();
  const isHeadOffice =
    Number(session.branch_id) === 1 ||
    (session.branch_name || "").toLowerCase().includes("head");

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [closing, setClosing] = useState(false);

  const loadBranches = async () => {
    if (isHeadOffice) {
      const r = await authAxios.get("/branch/active");
      setBranches(r.data || []);
      return;
    }
    if (session.branch_id) {
      setBranches([{ branch_id: session.branch_id, branch_name: session.branch_name || "Current Branch" }]);
      setSelectedBranch(String(session.branch_id));
    }
  };

  const loadStatus = async () => {
    const r = await authAxios.get("/day-close/status", { params: { date_str: date } });
    const rows = r.data || [];
    if (isHeadOffice) setStatus(rows);
    else setStatus(rows.filter(x => String(x.branch_id) === String(session.branch_id)));
  };

  useEffect(() => {
    if (role !== "admin" && role !== "manager") { navigate("/"); return; }
    loadBranches();
    authAxios.get("/shop/details")
      .then(res => { const appDate = res?.data?.app_date; if (appDate) setDate(appDate); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); }, [date]);

  const closeBranch = async () => {
    if (!selectedBranch) return;
    setClosing(true);
    try {
      await authAxios.post("/day-close/branch", null, { params: { date_str: date, branch_id: Number(selectedBranch) } });
      await loadStatus();
      clearSession();
      window.location.replace("/");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to close branch day", "error");
    } finally { setClosing(false); }
  };

  const closeShop = async () => {
    setClosing(true);
    try {
      await authAxios.post("/day-close/shop", null, { params: { date_str: date } });
      await loadStatus();
      clearSession();
      window.location.replace("/");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to close shop day", "error");
    } finally { setClosing(false); }
  };

  const closedCount = status.filter(s => s.closed).length;
  const totalCount = status.length || 1;
  const pct = Math.round((closedCount / totalCount) * 100);
  const allClosed = closedCount === status.length && status.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaMoon size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Day Close</h1>
              <p className="text-xs text-slate-500">End-of-day operations</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* Controls card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Close Day</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select date and branch, then close</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Date</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>

              {/* Branch */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Branch</label>
                {isHeadOffice ? (
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => {
                      const isClosed = status.find(s => String(s.branch_id) === String(b.branch_id) && s.closed);
                      return (
                        <option key={b.branch_id} value={b.branch_id} disabled={!!isClosed}>
                          {b.branch_name}{isClosed ? " (Closed)" : ""}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-600">
                    {branches[0]?.branch_name || "Current Branch"}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={closeBranch}
                disabled={!selectedBranch || closing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-50"
                style={{ background: BLUE }}
              >
                <FaMoon size={12} />
                {closing ? "Closing…" : "Close Branch Day"}
              </button>
              {isHeadOffice && (
                <button
                  onClick={closeShop}
                  disabled={closing}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700"
                >
                  <MdStorefront size={15} />
                  {closing ? "Closing…" : "Close Shop Day"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress card */}
        {status.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">Branch Close Progress</h2>
                <p className="text-xs text-slate-500 mt-0.5">{closedCount} of {status.length} branches closed</p>
              </div>
              <span className={`text-sm font-bold ${allClosed ? "text-emerald-600" : "text-slate-500"}`}>
                {pct}%
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Progress bar */}
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: allClosed ? "#10b981" : BLUE }}
                />
              </div>

              {/* Branch status grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {status.map(s => (
                  <div
                    key={s.branch_id}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${s.closed ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <MdStorefront size={15} className={s.closed ? "text-emerald-600" : "text-slate-400"} />
                      <span className="text-sm font-medium text-slate-800">{s.branch_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {s.closed
                        ? <><FaCheckCircle size={12} className="text-emerald-600" /><span className="text-xs font-semibold text-emerald-700">Closed</span></>
                        : <><FaCircle size={10} className="text-slate-300" /><span className="text-xs font-medium text-slate-400">Open</span></>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
