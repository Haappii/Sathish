import { useCallback, useEffect, useState } from "react";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import {
  buildDenominationCounts,
  calcDenominationTotal,
  formatCashDenomination,
  normalizeCashDenominations,
  DEFAULT_CASH_DENOMINATIONS,
} from "../utils/cashDenominations";
import {
  FaCashRegister, FaArrowUp, FaArrowDown,
  FaLock, FaUnlock, FaHistory,
} from "react-icons/fa";
import { MdOutlineAdd, MdOutlineRemove } from "react-icons/md";

const BLUE = "#0B3C8C";
const GREEN = "#059669";
const RED = "#dc2626";

const fmt = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtTime = (dt) => {
  if (!dt) return "";
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

export default function CashDrawer() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [shift, setShift] = useState(null);
  const [movements, setMovements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [denominations, setDenominations] = useState(DEFAULT_CASH_DENOMINATIONS);

  // modal: null | "open" | "topup" | "withdrawal" | "close"
  const [modal, setModal] = useState(null);

  // open-shift form
  const [openingCash, setOpeningCash] = useState("");

  // movement form
  const [movAmount, setMovAmount] = useState("");
  const [movReason, setMovReason] = useState("");

  // close-shift form
  const [denomCounts, setDenomCounts] = useState({});
  const [closingNotes, setClosingNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftRes, shopRes] = await Promise.all([
        authAxios.get("/cash-drawer/current"),
        authAxios.get("/shop/details").catch(() => ({ data: {} })),
      ]);
      const data = shiftRes.data || {};
      setShift(data.shift || null);
      setMovements(data.movements || []);
      setSummary(data.summary || null);
      setDenominations(normalizeCashDenominations(shopRes.data?.cash_denominations));
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to load cash drawer", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openModal = (type) => {
    setMovAmount("");
    setMovReason("");
    setOpeningCash("");
    if (type === "close") {
      setDenomCounts(buildDenominationCounts(denominations));
      setClosingNotes("");
    }
    setModal(type);
  };
  const closeModal = () => setModal(null);

  /* ── Actions ─────────────────────────────────────────────────── */

  const handleOpenShift = async () => {
    const amt = parseFloat(openingCash);
    if (isNaN(amt) || amt < 0) {
      showToast("Enter a valid opening cash amount (0 or more)", "error");
      return;
    }
    setActionLoading(true);
    try {
      await authAxios.post("/cash-drawer/open", { opening_cash: amt });
      closeModal();
      showToast("Shift opened", "success");
      await load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to open shift", "error");
    } finally { setActionLoading(false); }
  };

  const handleMovement = async (movType) => {
    const amt = parseFloat(movAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Enter a valid amount greater than 0", "error");
      return;
    }
    setActionLoading(true);
    try {
      await authAxios.post("/cash-drawer/movement", {
        movement_type: movType,
        amount: amt,
        reason: movReason.trim() || null,
      });
      closeModal();
      showToast(movType === "IN" ? "Cash top-up recorded" : "Cash withdrawal recorded", "success");
      await load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to record movement", "error");
    } finally { setActionLoading(false); }
  };

  const denomTotal = calcDenominationTotal(denominations, denomCounts);
  const expectedCash = Number(summary?.expected_cash || 0);
  const closingDiff = denomTotal - expectedCash;

  const handleCloseShift = async () => {
    const denoms = normalizeCashDenominations(denominations);
    const hasInput = denoms.some(
      (d) => Number(denomCounts[formatCashDenomination(d)] || 0) > 0
    );
    if (!hasInput) {
      showToast("Enter at least one denomination count before closing", "error");
      return;
    }
    setActionLoading(true);
    try {
      const counts = {};
      denoms.forEach((denom) => {
        const key = formatCashDenomination(denom);
        const val = Number(denomCounts[key] || 0);
        if (val > 0) counts[key] = val;
      });
      await authAxios.post("/cash-drawer/close", {
        denomination_counts: counts,
        closing_notes: closingNotes.trim() || null,
      });
      closeModal();
      showToast("Shift closed successfully", "success");
      await load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to close shift", "error");
    } finally { setActionLoading(false); }
  };

  /* ── Render ─────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading cash drawer…</span>
        </div>
      </div>
    );
  }

  const isOpen = shift?.status === "OPEN";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaCashRegister size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Cash Drawer</h1>
              <p className="text-xs text-slate-500">Manage cash shifts and movements</p>
            </div>
          </div>
          {/* Status badge */}
          <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {isOpen ? "● OPEN" : "○ CLOSED"}
          </span>
        </div>
      </div>

      <div className="p-5 max-w-3xl mx-auto space-y-5">

        {/* ── No Shift ── */}
        {!isOpen && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: `${BLUE}12` }}>
              <FaUnlock size={24} style={{ color: BLUE }} />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800">No open shift</p>
              <p className="text-sm text-slate-500 mt-1">Open a shift to start recording cash transactions</p>
            </div>
            <button
              onClick={() => openModal("open")}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition"
              style={{ background: GREEN }}
            >
              Open Shift
            </button>
            {shift && (
              <p className="text-xs text-slate-400">Last shift closed: {fmtTime(shift.closed_at)}</p>
            )}
          </div>
        )}

        {/* ── Open Shift ── */}
        {isOpen && summary && (
          <>
            {/* Shift Info + Action Buttons */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">Current Shift</p>
                  <p className="text-xs text-slate-400 mt-0.5">Opened: {fmtTime(shift.opened_at)}</p>
                </div>
                <button
                  onClick={() => openModal("close")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm hover:opacity-90 transition"
                  style={{ background: RED }}
                >
                  <FaLock size={11} />
                  Close Shift
                </button>
              </div>

              {/* Summary Cards */}
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <SummaryCard label="Opening Cash" value={fmt(summary.opening_cash)} />
                <SummaryCard label="Cash Sales" value={fmt(summary.cash_sales)} color="emerald" />
                <SummaryCard label="Collections" value={fmt(summary.cash_collections)} color="emerald" />
                <SummaryCard label="Cash Top-Up" value={fmt(summary.cash_top_up)} color="blue" />
                <SummaryCard label="Cash Withdrawal" value={fmt(summary.cash_withdrawal)} color="rose" />
                <SummaryCard label="Cash Refunds" value={fmt(summary.cash_refunds)} color="rose" />
              </div>

              {/* Expected Cash */}
              <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center justify-between"
                style={{ background: `${BLUE}08`, border: `1.5px solid ${BLUE}25` }}>
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Expected Cash in Drawer</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Opening + Sales + Top-Up + Collections − Refunds − Withdrawal</p>
                </div>
                <span className="text-xl font-bold" style={{ color: BLUE }}>{fmt(summary.expected_cash)}</span>
              </div>

              {/* Action Buttons */}
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => openModal("topup")}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition"
                  style={{ background: GREEN }}
                >
                  <MdOutlineAdd size={18} />
                  Cash Top-Up
                </button>
                <button
                  onClick={() => openModal("withdrawal")}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition"
                  style={{ background: "#b45309" }}
                >
                  <MdOutlineRemove size={18} />
                  Cash Withdrawal
                </button>
              </div>
            </div>

            {/* Movement History */}
            {movements.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                  <FaHistory size={13} style={{ color: BLUE }} />
                  <p className="text-sm font-bold text-slate-800">Movement History</p>
                  <span className="ml-auto text-xs text-slate-400">{movements.length} record{movements.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {movements.map((m) => (
                    <div key={m.movement_id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.movement_type === "IN" ? "bg-emerald-50" : "bg-amber-50"}`}>
                          {m.movement_type === "IN"
                            ? <FaArrowDown size={12} className="text-emerald-600" />
                            : <FaArrowUp size={12} className="text-amber-600" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            {m.movement_type === "IN" ? "Top-Up" : "Withdrawal"}
                          </p>
                          {m.reason && <p className="text-xs text-slate-400">{m.reason}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${m.movement_type === "IN" ? "text-emerald-600" : "text-amber-700"}`}>
                          {m.movement_type === "IN" ? "+" : "−"}{fmt(m.amount)}
                        </p>
                        <p className="text-[11px] text-slate-400">{fmtTime(m.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ════ MODALS ════ */}

      {/* Open Shift Modal */}
      {modal === "open" && (
        <Modal title="Open Cash Shift" onClose={closeModal}>
          <p className="text-xs text-slate-500">Enter the opening cash amount already in the drawer.</p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Opening Cash (₹)</label>
            <input
              type="number" min="0" step="0.01"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpenShift()}
              placeholder="0.00"
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={handleOpenShift} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              style={{ background: GREEN }}>
              {actionLoading ? "Opening…" : "Open Shift"}
            </button>
          </div>
        </Modal>
      )}

      {/* Top-Up Modal */}
      {modal === "topup" && (
        <Modal title="Cash Top-Up" onClose={closeModal}>
          <p className="text-xs text-slate-500">Record cash added into the drawer (e.g. petty cash replenishment).</p>
          <MovementForm
            amount={movAmount} setAmount={setMovAmount}
            reason={movReason} setReason={setMovReason}
            amountLabel="Top-Up Amount (₹)"
            reasonPlaceholder="e.g. Petty cash refill"
          />
          <div className="flex gap-3 pt-1">
            <button onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={() => handleMovement("IN")} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              style={{ background: GREEN }}>
              {actionLoading ? "Saving…" : "Add Top-Up"}
            </button>
          </div>
        </Modal>
      )}

      {/* Withdrawal Modal */}
      {modal === "withdrawal" && (
        <Modal title="Cash Withdrawal" onClose={closeModal}>
          <p className="text-xs text-slate-500">Record cash removed from the drawer (e.g. deposited to bank, given to manager).</p>
          <MovementForm
            amount={movAmount} setAmount={setMovAmount}
            reason={movReason} setReason={setMovReason}
            amountLabel="Withdrawal Amount (₹)"
            reasonPlaceholder="e.g. Bank deposit, Manager collection"
          />
          <div className="flex gap-3 pt-1">
            <button onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={() => handleMovement("OUT")} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              style={{ background: "#b45309" }}>
              {actionLoading ? "Saving…" : "Record Withdrawal"}
            </button>
          </div>
        </Modal>
      )}

      {/* Close Shift Modal */}
      {modal === "close" && (
        <ClosingModal
          denominations={denominations}
          denomCounts={denomCounts}
          setDenomCounts={setDenomCounts}
          denomTotal={denomTotal}
          expectedCash={expectedCash}
          closingDiff={closingDiff}
          closingNotes={closingNotes}
          setClosingNotes={setClosingNotes}
          summary={summary}
          onClose={closeModal}
          onConfirm={handleCloseShift}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function SummaryCard({ label, value, color }) {
  const colorMap = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    rose: "text-rose-600 bg-rose-50 border-rose-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
  };
  const cls = colorMap[color] || "text-slate-700 bg-slate-50 border-slate-100";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}

function MovementForm({ amount, setAmount, reason, setReason, amountLabel, reasonPlaceholder }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600">{amountLabel}</label>
        <input
          type="number" min="0.01" step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ClosingModal({
  denominations, denomCounts, setDenomCounts,
  denomTotal, expectedCash, closingDiff,
  closingNotes, setClosingNotes,
  summary, onClose, onConfirm, loading,
}) {
  const denoms = normalizeCashDenominations(denominations);
  const diff = closingDiff;
  const hasCounts = denoms.some((d) => Number(denomCounts[formatCashDenomination(d)] || 0) > 0);

  const setCount = (key, val) => {
    const n = parseInt(val, 10);
    setDenomCounts((prev) => ({ ...prev, [key]: isNaN(n) || n < 0 ? "" : String(n) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Close Shift — Cash Count</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">

          {/* Mini summary: top-up and withdrawal */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-center">
              <p className="text-emerald-600 font-semibold">Top-Ups</p>
              <p className="text-emerald-700 font-bold text-sm mt-0.5">+{"₹"}{Number(summary?.cash_top_up || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-center">
              <p className="text-amber-600 font-semibold">Withdrawals</p>
              <p className="text-amber-700 font-bold text-sm mt-0.5">−{"₹"}{Number(summary?.cash_withdrawal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Expected */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
            <span className="text-xs font-semibold text-blue-700">Expected Cash</span>
            <span className="text-sm font-bold text-blue-800">₹{Number(expectedCash).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>

          {/* Denomination grid */}
          <div>
            <p className="text-xs font-bold text-slate-700 mb-2">Enter Denomination Counts</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                <span>Denomination</span>
                <span className="text-center">Count</span>
                <span className="text-right">Amount</span>
              </div>
              {denoms.map((denom) => {
                const key = formatCashDenomination(denom);
                const cnt = Number(denomCounts[key] || 0);
                const subtotal = denom * cnt;
                return (
                  <div key={key} className="grid grid-cols-3 items-center px-3 py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-sm font-semibold text-slate-700">₹{key}</span>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        min="0"
                        value={denomCounts[key] ?? ""}
                        onChange={(e) => setCount(key, e.target.value)}
                        placeholder="0"
                        className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
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
                  {hasCounts ? `₹${denomTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Difference */}
          {hasCounts && (
            <div className={`px-4 py-3 rounded-xl flex items-center justify-between
              ${Math.abs(diff) < 0.01 ? "bg-emerald-50 border border-emerald-200" : diff > 0 ? "bg-blue-50 border border-blue-200" : "bg-rose-50 border border-rose-200"}`}>
              <div>
                <p className={`text-xs font-bold ${Math.abs(diff) < 0.01 ? "text-emerald-700" : diff > 0 ? "text-blue-700" : "text-rose-600"}`}>
                  {Math.abs(diff) < 0.01 ? "✓ Cash tallied perfectly" : diff > 0 ? "Cash Over" : "Cash Short"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Expected {fmt(expectedCash)} · Physical {fmt(denomTotal)}
                </p>
              </div>
              {Math.abs(diff) >= 0.01 && (
                <span className={`text-base font-bold ${diff > 0 ? "text-blue-700" : "text-rose-600"}`}>
                  {diff > 0 ? "+" : ""}{fmt(diff)}
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Closing Notes (optional)</label>
            <textarea
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Any remarks for end-of-shift…"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !hasCounts}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            style={{ background: RED }}
          >
            {loading ? "Closing…" : "Close Shift"}
          </button>
        </div>
      </div>
    </div>
  );
}
