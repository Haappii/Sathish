import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { getSession, clearSession, isHeadOfficeBranch } from "../utils/auth";
import { getBusinessDate, syncBusinessDate } from "../utils/businessDate";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import {
  FaMoon,
  FaCheckCircle,
  FaCircle,
  FaMoneyBillWave,
} from "react-icons/fa";
import { MdStorefront } from "react-icons/md";

const BLUE = "#0B3C8C";

const fmt = (n) =>
  `Rs ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
  const [dayReport, setDayReport] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadBranches = async () => {
    if (isHeadOffice) {
      const response = await authAxios.get("/branch/active");
      setBranches(response.data || []);
      return;
    }

    if (session.branch_id) {
      setBranches([
        {
          branch_id: session.branch_id,
          branch_name: session.branch_name || "Current Branch",
        },
      ]);
      setSelectedBranch(String(session.branch_id));
    }
  };

  const loadStatus = async () => {
    const response = await authAxios.get("/day-close/status", {
      params: { date_str: date },
    });
    const rows = response.data || [];
    if (isHeadOffice) setStatus(rows);
    else setStatus(rows.filter((row) => String(row.branch_id) === String(session.branch_id)));
  };

  const loadDayReport = async (branchId, dateStr) => {
    if (!branchId || !dateStr) {
      setDayReport(null);
      return;
    }

    setSummaryLoading(true);
    try {
      const response = await authAxios.get("/day-close/cash-summary", {
        params: { date_str: dateStr, branch_id: branchId },
      });
      setDayReport(response.data || null);
    } catch {
      setDayReport(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "admin" && role !== "manager") {
      navigate("/");
      return;
    }
    if (!navigator.onLine) return;

    loadBranches();
    authAxios
      .get("/shop/details")
      .then((response) => {
        const appDate = syncBusinessDate(response?.data?.app_date);
        if (appDate) setDate(appDate);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!navigator.onLine) return;
    loadStatus();
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDayReport(null);
    if (selectedBranch && date && navigator.onLine) {
      loadDayReport(selectedBranch, date);
    }
  }, [selectedBranch, date]);

  const closeBranch = async () => {
    if (!selectedBranch) return;
    if (!navigator.onLine) {
      showToast("Day-end requires an active server connection. Please connect and try again.", "error");
      return;
    }

    setClosing(true);
    try {
      await authAxios.post("/day-close/branch", null, {
        params: { date_str: date, branch_id: Number(selectedBranch) },
      });
      await loadStatus();
      clearSession();
      window.location.replace("/");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to close branch day", "error");
    } finally {
      setClosing(false);
    }
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
    } finally {
      setClosing(false);
    }
  };

  const closedCount = status.filter((row) => row.closed).length;
  const totalCount = status.length || 1;
  const pct = Math.round((closedCount / totalCount) * 100);
  const allClosed = closedCount === status.length && status.length > 0;
  const selectedBranchClosed = status.some(
    (row) => String(row.branch_id) === String(selectedBranch) && row.closed,
  );

  if (!navigator.onLine) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 max-w-md text-center space-y-3">
          <div className="text-3xl">Offline</div>
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

  const reportTotals = dayReport?.report_totals || {};
  const paymentModes = Object.entries(dayReport?.payment_modes || {});
  const reportCards = [
    { label: "Total Amount", value: fmt(reportTotals.total_amount), tone: "slate" },
    { label: "Total Cash", value: fmt(reportTotals.cash), tone: "emerald" },
    { label: "UPI", value: fmt(reportTotals.upi), tone: "blue" },
    { label: "Card", value: fmt(reportTotals.card), tone: "slate" },
    { label: "Gift Card", value: fmt(reportTotals.gift_card), tone: "amber" },
    { label: "Discount", value: fmt(reportTotals.discount), tone: "rose" },
    { label: "GST", value: fmt(reportTotals.gst), tone: "blue" },
  ];

  if (Number(reportTotals.wallet || 0) > 0) {
    reportCards.splice(5, 0, {
      label: "Wallet",
      value: fmt(reportTotals.wallet),
      tone: "slate",
    });
  }

  if (Number(reportTotals.other || 0) > 0) {
    reportCards.splice(6, 0, {
      label: "Other",
      value: fmt(reportTotals.other),
      tone: "slate",
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${BLUE}15` }}
            >
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Close Day</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select date and branch, review the day-closing report, then close the day.
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Business Date</label>
                <div className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-700 font-medium">
                  {date}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Branch</label>
                {isHeadOffice ? (
                  <select
                    value={selectedBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  >
                    <option value="">Select Branch</option>
                    {branches.map((branch) => {
                      const isClosed = status.find(
                        (row) => String(row.branch_id) === String(branch.branch_id) && row.closed,
                      );
                      return (
                        <option key={branch.branch_id} value={branch.branch_id} disabled={!!isClosed}>
                          {branch.branch_name}
                          {isClosed ? " (Closed)" : ""}
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

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={closeBranch}
                disabled={!selectedBranch || selectedBranchClosed || closing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-50"
                style={{ background: BLUE }}
              >
                <FaMoon size={12} />
                {closing ? "Closing..." : "Close Branch Day"}
              </button>

              {isHeadOffice && (
                <button
                  onClick={closeShop}
                  disabled={closing || !allClosed}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700"
                >
                  <MdStorefront size={15} />
                  {closing ? "Closing..." : "Close Shop Day"}
                </button>
              )}
            </div>

            {selectedBranchClosed && (
              <p className="text-[11px] text-emerald-600">This branch is already closed for the selected date.</p>
            )}

            {isHeadOffice && status.length > 0 && !allClosed && (
              <p className="text-[11px] text-amber-600">
                Close all active branches first before closing the full shop day.
              </p>
            )}
          </div>
        </div>

        {selectedBranch && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${BLUE}15` }}
              >
                <FaMoneyBillWave size={14} style={{ color: BLUE }} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">Day Closing Report</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {dayReport
                    ? `${reportTotals.bill_count || 0} bill${Number(reportTotals.bill_count || 0) !== 1 ? "s" : ""} for ${date}`
                    : "Review branch totals for the selected day."}
                </p>
              </div>
            </div>

            {summaryLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading day closing report...</div>
            ) : !dayReport ? (
              <div className="py-10 text-center text-sm text-slate-400">
                No data available for this branch and date.
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {reportCards.map((card) => (
                    <ReportCard
                      key={card.label}
                      label={card.label}
                      value={card.value}
                      tone={card.tone}
                    />
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-800">Payment Breakdown</p>
                  </div>

                  {paymentModes.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-slate-400">No payment data for this branch and date.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {paymentModes.map(([mode, amount]) => (
                        <div key={mode} className="flex items-center justify-between px-4 py-3 text-sm">
                          <span className="font-medium text-slate-600">{mode}</span>
                          <span className="font-semibold text-slate-800">{fmt(amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {status.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">Branch Close Progress</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {closedCount} of {status.length} branches closed
                </p>
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
                {status.map((row) => (
                  <div
                    key={row.branch_id}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                      row.closed ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <MdStorefront size={15} className={row.closed ? "text-emerald-600" : "text-slate-400"} />
                      <span className="text-sm font-medium text-slate-800">{row.branch_name}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {row.closed ? (
                        <>
                          <FaCheckCircle size={12} className="text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700">Closed</span>
                        </>
                      ) : (
                        <>
                          <FaCircle size={10} className="text-slate-300" />
                          <span className="text-xs font-medium text-slate-400">Open</span>
                        </>
                      )}
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

function ReportCard({ label, value, tone = "slate" }) {
  const toneMap = {
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone] || toneMap.slate}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-bold mt-1">{value}</p>
    </div>
  );
}
