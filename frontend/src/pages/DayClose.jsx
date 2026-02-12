import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { getSession, clearSession } from "../utils/auth";
import { useToast } from "../components/Toast";

export default function DayClose() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const role = (session.role || session.role_name || "").toLowerCase();
  const isHeadOffice = Number(session.branch_id) === 1 || (session.branch_name || "").toLowerCase().includes("head");

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
      setBranches([{
        branch_id: session.branch_id,
        branch_name: session.branch_name || "Current Branch"
      }]);
      setSelectedBranch(String(session.branch_id));
    }
  };

  const loadStatus = async () => {
    const r = await authAxios.get("/day-close/status", {
      params: { date_str: date }
    });
    const rows = r.data || [];
    if (isHeadOffice) {
      setStatus(rows);
    } else {
      setStatus(rows.filter(x => String(x.branch_id) === String(session.branch_id)));
    }
  };

  useEffect(() => {
    if (role !== "admin" && role !== "manager") {
      navigate("/");
      return;
    }
    loadBranches();
    authAxios.get("/shop/details")
      .then(res => {
        const appDate = res?.data?.app_date;
        if (appDate) {
          setDate(appDate);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
  }, [date]);

  const closeBranch = async () => {
    if (!selectedBranch) return;
    setClosing(true);
    try {
      await authAxios.post("/day-close/branch", null, {
        params: { date_str: date, branch_id: Number(selectedBranch) }
      });
      await loadStatus();
      clearSession();
      window.location.replace("/");
    } catch (err) {
      const msg = err?.response?.data?.detail;
      showToast(msg || "Failed to close branch day", "error");
    } finally {
      setClosing(false);
    }
  };

  const closeShop = async () => {
    setClosing(true);
    try {
      await authAxios.post("/day-close/shop", null, {
        params: { date_str: date }
      });
      await loadStatus();
      clearSession();
      window.location.replace("/");
    } catch (err) {
      const msg = err?.response?.data?.detail;
      showToast(msg || "Failed to close shop day", "error");
    } finally {
      setClosing(false);
    }
  };
  const closedCount = status.filter(s => s.closed).length;
  const totalCount = status.length || 1;
  const pct = Math.round((closedCount / totalCount) * 100);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-xl font-semibold">Day Close</h2>
      </div>

      <div className="bg-white rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="text-sm text-gray-600">Date</label>
            <input
              type="date"
              className="block border rounded px-3 py-2"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Branch</label>
            {isHeadOffice ? (
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="block border rounded px-3 py-2"
              >
                <option value="">Select Branch</option>
                {branches.map(b => {
                  const isClosed = status.find(
                    s => String(s.branch_id) === String(b.branch_id) && s.closed
                  );
                  return (
                    <option
                      key={b.branch_id}
                      value={b.branch_id}
                      disabled={!!isClosed}
                    >
                      {b.branch_name}{isClosed ? " (Closed)" : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="block border rounded px-3 py-2 bg-gray-50">
                {(branches[0] && branches[0].branch_name) || "Current Branch"}
              </div>
            )}
          </div>

          <button
            onClick={closeBranch}
            disabled={!selectedBranch || closing}
            className="px-4 py-2 rounded bg-emerald-600 text-white"
          >
            {closing ? "Closing..." : "Close Branch Day"}
          </button>

          {isHeadOffice && (
            <button
              onClick={closeShop}
              disabled={closing}
              className="px-4 py-2 rounded bg-blue-600 text-white"
            >
              {closing ? "Closing..." : "Close Shop Day"}
            </button>
          )}
        </div>

        <div>
          <div className="text-sm text-gray-600 mb-2">
            Branch Close Progress: {closedCount}/{totalCount}
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {status.map(s => (
            <div
              key={s.branch_id}
              className="border rounded-lg p-3 flex justify-between"
            >
              <span>{s.branch_name}</span>
              <span className={s.closed ? "text-emerald-600" : "text-gray-500"}>
                {s.closed ? "Closed" : "Open"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Month close is now automatic during Shop Close */}
    </div>
  );
}



