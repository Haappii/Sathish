import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { getSession, clearSession, isHeadOfficeBranch } from "../utils/auth";
import { getBusinessDate, syncBusinessDate } from "../utils/businessDate";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import {
  FaMoon, FaCheckCircle, FaCircle,
  FaArrowDown, FaArrowUp, FaWallet,
} from "react-icons/fa";
import { MdStorefront } from "react-icons/md";
import {
  buildDenominationCounts,
  calcDenominationTotal,
  formatCashDenomination,
  normalizeCashDenominations,
  DEFAULT_CASH_DENOMINATIONS,
  hasAnyDenominationInput,
} from "../utils/cashDenominations";

const BLUE = "#0B3C8C";

const fmt = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DayClose() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const role = (session.role || session.role_name || "").toLowerCase();
  const isHeadOffice = isHeadOfficeBranch(session);

  const [date, setDate] = useState(() => getBusinessDate());
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [closing, setClosing] = useState(false);

  // Cash summary state
  const [cashSummary, setCashSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [denominations, setDenominations] = useState(DEFAULT_CASH_DENOMINATIONS);
  const [denomCounts, setDenomCounts] = useState({});

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

  const loadCashSummary = async (branchId, dateStr) => {
    if (!branchId || !dateStr) { setCashSummary(null); return; }
    setSummaryLoading(true);
    try {
      const r = await authAxios.get("/day-close/cash-summary", {
        params: { date_str: dateStr, branch_id: branchId },
      });
      setCashSummary(r.data);
    } catch {
      setCashSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "admin" && role !== "manager") { navigate("/"); return; }
    if (!navigator.onLine) return;
    loadBranches();
    authAxios.get("/shop/details")
      .then(res => {
        const appDate = syncBusinessDate(res?.data?.app_date);
        if (appDate) setDate(appDate);
        const denoms = normalizeCashDenominations(res?.data?.cash_denominations);
        setDenominations(denoms);
        setDenomCounts(buildDenominationCounts(denoms));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); }, [date]);

  // Reload summary when branch or date changes
  useEffect(() => {
    setDenomCounts(buildDenominationCounts(denominations));
    setCashSummary(null);
    if (selectedBranch && date) loadCashSummary(selectedBranch, date);
  }, [selectedBranch, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeBranch = async () => {
    if (!selectedBranch) return;
    if (!navigator.onLine) {
      showToast("Day-end requires an active server connection. Please connect and try again.", "error");
      return;
    }
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
    if (!navigator.onLine) {
      showToast("Day-end requires an active server connection. Please connect and try again.", "error");
      return;
    }
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

  // Cash tally logic (denomination-based)
  const physical = calcDenominationTotal(denominations, denomCounts);
  const systemCash = cashSummary ? Number(cashSummary.system_cash || 0) : 0;
  const diff = physical - systemCash;
  const hasTallied = hasAnyDenominationInput(denomCounts);

  if (!navigator.onLine) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 max-w-md text-center space-y-3">
          <div className="text-3xl">📡</div>
          <h2 className="text-lg font-bold text-slate-800">You are offline</h2>
          <p className="text-sm text-slate-500">
            Day-end requires a live connection to the server. Please reconnect to the network and try again.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: BLUE }}
          >
            Go Back
          </button>
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
            <p className="text-xs text-slate-500 mt-0.5">Select date and branch, then review cash and close</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Business Date</label>
                <div className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-700 font-medium">
                  {date}
                </div>
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
                disabled={!selectedBranch || closing || !hasTallied}
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
            {selectedBranch && !hasTallied && (
              <p className="text-[11px] text-amber-600">
                Enter denomination counts in the cash tally below to enable branch close.
              </p>
            )}
          </div>
        </div>

        {/* Cash Flow Summary */}
        {selectedBranch && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                <FaWallet size={14} style={{ color: BLUE }} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">Cash Flow Summary</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cashSummary ? `${cashSummary.bill_count} bill${cashSummary.bill_count !== 1 ? "s" : ""} for ${date}` : "Loading…"}
                </p>
              </div>
            </div>

            {summaryLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading cash summary…</div>
            ) : !cashSummary ? (
              <div className="py-10 text-center text-sm text-slate-400">No data available for this branch and date.</div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Flow: Opening → Cash In → Cash Out → System Cash */}
                <div className="space-y-2">

                  {/* Opening Balance */}
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Opening Balance</p>
                      <p className="text-[11px] text-slate-400">Cash in drawer at start of day</p>
                    </div>
                    <span className="text-sm font-bold text-slate-700">{fmt(cashSummary.opening_balance)}</span>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center text-slate-300 text-lg select-none">↓</div>

                  {/* Cash In */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between border-b border-emerald-100">
                      <div className="flex items-center gap-2">
                        <FaArrowDown size={11} className="text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">+ Cash In</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">{fmt(cashSummary.cash_in)}</span>
                    </div>
                    <div className="px-4 py-3 space-y-1.5">
                      {/* Sales breakdown */}
                      {Object.entries(cashSummary.payment_modes || {}).map(([mode, amt]) => (
                        <div key={mode} className="flex justify-between text-xs">
                          <span className="text-slate-500">{mode} {mode === "CASH" ? "(Sales)" : ""}</span>
                          <span className={`font-medium ${mode === "CASH" ? "text-emerald-700" : "text-slate-500"}`}>{fmt(amt)}</span>
                        </div>
                      ))}
                      {/* Top-Up */}
                      {(cashSummary.cash_top_up > 0) && (
                        <div className="flex justify-between text-xs border-t border-emerald-100 pt-1.5 mt-1.5">
                          <span className="text-slate-500 font-semibold">Cash Top-Up</span>
                          <span className="font-bold text-emerald-700">{fmt(cashSummary.cash_top_up)}</span>
                        </div>
                      )}
                      {Object.keys(cashSummary.payment_modes || {}).length === 0 && !cashSummary.cash_top_up && (
                        <p className="text-xs text-slate-400">No cash inflows</p>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center text-slate-300 text-lg select-none">↓</div>

                  {/* Cash Out */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50 overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between border-b border-rose-100">
                      <div className="flex items-center gap-2">
                        <FaArrowUp size={11} className="text-rose-500" />
                        <span className="text-xs font-bold text-rose-600 uppercase tracking-wide">− Cash Out</span>
                      </div>
                      <span className="text-sm font-bold text-rose-600">{fmt(cashSummary.cash_out)}</span>
                    </div>
                    <div className="px-4 py-3 space-y-1.5">
                      {cashSummary.return_count > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Returns ({cashSummary.return_count})</span>
                          <span className="font-medium text-rose-600">{fmt(cashSummary.return_cash)}</span>
                        </div>
                      )}
                      {cashSummary.expenses.filter(e => e.payment_mode === "CASH").map((e, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-500">{e.category || "Expense"}</span>
                          <span className="font-medium text-rose-600">{fmt(e.amount)}</span>
                        </div>
                      ))}
                      {cashSummary.cash_wages > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Wages (Cash)</span>
                          <span className="font-medium text-rose-600">{fmt(cashSummary.cash_wages)}</span>
                        </div>
                      )}
                      {/* Withdrawal */}
                      {(cashSummary.cash_withdrawal > 0) && (
                        <div className="flex justify-between text-xs border-t border-rose-100 pt-1.5 mt-1.5">
                          <span className="text-slate-500 font-semibold">Cash Withdrawal</span>
                          <span className="font-bold text-rose-600">{fmt(cashSummary.cash_withdrawal)}</span>
                        </div>
                      )}
                      {cashSummary.cash_out === 0 && (
                        <p className="text-xs text-slate-400">No cash outflows</p>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center text-slate-300 text-lg select-none">↓</div>

                  {/* System Cash */}
                  <div
                    className="px-4 py-3.5 rounded-xl flex items-center justify-between"
                    style={{ background: `${BLUE}08`, border: `1.5px solid ${BLUE}30` }}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">System Cash</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Opening + Cash In − Cash Out</p>
                    </div>
                    <span className="text-xl font-bold" style={{ color: BLUE }}>{fmt(cashSummary.system_cash)}</span>
                  </div>
                </div>

                {/* Physical Cash Count — Denomination Entry */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Physical Cash Count (Denomination-wise)</p>

                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    <div className="grid grid-cols-3 bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      <span>Note / Coin</span>
                      <span className="text-center">Count</span>
                      <span className="text-right">Amount</span>
                    </div>
                    {normalizeCashDenominations(denominations).map(denom => {
                      const key = formatCashDenomination(denom);
                      const cnt = Number(denomCounts[key] || 0);
                      const subtotal = denom * cnt;
                      return (
                        <div key={key} className="grid grid-cols-3 items-center px-3 py-1.5 border-t border-slate-100">
                          <span className="text-sm font-semibold text-slate-700">₹{key}</span>
                          <div className="flex justify-center">
                            <input
                              type="number"
                              min="0"
                              value={denomCounts[key] ?? ""}
                              onChange={e => {
                                const n = parseInt(e.target.value, 10);
                                setDenomCounts(prev => ({ ...prev, [key]: isNaN(n) || n < 0 ? "" : String(n) }));
                              }}
                              placeholder="0"
                              className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                            />
                          </div>
                          <span className={`text-right text-sm font-medium ${subtotal > 0 ? "text-slate-700" : "text-slate-300"}`}>
                            {subtotal > 0 ? `₹${subtotal.toLocaleString("en-IN")}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                    {/* Total row */}
                    <div className="grid grid-cols-3 items-center px-3 py-2 bg-slate-50 border-t-2 border-slate-200">
                      <span className="text-xs font-bold text-slate-700 col-span-2">Physical Total</span>
                      <span className="text-right text-sm font-bold text-slate-800">
                        {hasTallied ? `₹${physical.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                      </span>
                    </div>
                  </div>

                  {hasTallied && (
                    <div className={`rounded-lg px-4 py-3 flex items-center justify-between
                      ${Math.abs(diff) < 0.01 ? "bg-emerald-50 border border-emerald-200" : diff > 0 ? "bg-blue-50 border border-blue-200" : "bg-rose-50 border border-rose-200"}`}
                    >
                      <div>
                        <p className={`text-xs font-semibold ${Math.abs(diff) < 0.01 ? "text-emerald-700" : diff > 0 ? "text-blue-700" : "text-rose-600"}`}>
                          {Math.abs(diff) < 0.01 ? "✓ Cash tallied perfectly" : diff > 0 ? "Cash Over" : "Cash Short"}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          System: {fmt(systemCash)} · Physical: {fmt(physical)}
                        </p>
                      </div>
                      {Math.abs(diff) >= 0.01 && (
                        <span className={`text-lg font-bold ${diff > 0 ? "text-blue-700" : "text-rose-600"}`}>
                          {diff > 0 ? "+" : ""}{fmt(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

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
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: allClosed ? "#10b981" : BLUE }}
                />
              </div>
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
