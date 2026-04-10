import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import BackButton from "../../components/BackButton";
import {
  DEFAULT_CASH_DENOMINATIONS,
  formatCashDenomination,
  normalizeCashDenominations,
} from "../../utils/cashDenominations";
import { FaCashRegister, FaPlus, FaTrash, FaUndo } from "react-icons/fa";

const BLUE = "#0B3C8C";

export default function CashDenominationSetup() {
  const { showToast } = useToast();
  const session = getSession();
  const userRole = session?.role || session?.role_name || "";
  const isAdmin = ["admin", "super admin"].includes(String(userRole).trim().toLowerCase());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denominations, setDenominations] = useState([...DEFAULT_CASH_DENOMINATIONS]);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    authAxios.get("/shop/details")
      .then(res => {
        const denoms = normalizeCashDenominations(res?.data?.cash_denominations);
        setDenominations(denoms);
      })
      .catch(() => showToast("Failed to load denomination settings", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const addDenomination = () => {
    const value = Number(newValue);
    if (!Number.isFinite(value) || value <= 0) {
      showToast("Enter a valid denomination value", "error");
      return;
    }
    const updated = normalizeCashDenominations([...denominations, value]);
    setDenominations(updated);
    setNewValue("");
  };

  const removeDenomination = (value) => {
    if (denominations.length <= 1) {
      showToast("Keep at least one denomination", "error");
      return;
    }
    setDenominations(denominations.filter(d => Number(d) !== Number(value)));
  };

  const resetToDefault = () => {
    setDenominations([...DEFAULT_CASH_DENOMINATIONS]);
    showToast("Reset to default denominations", "info");
  };

  const save = async () => {
    setSaving(true);
    try {
      await authAxios.post("/shop/", { cash_denominations: denominations }, {
        headers: { "x-user-role": userRole },
      });
      showToast("Denomination settings saved", "success");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Save failed", "error");
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading…</span>
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
              <FaCashRegister size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Cash Denominations</h1>
              <p className="text-xs text-slate-500">Configure note and coin denominations for cash counting</p>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !isAdmin}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-50"
            style={{ background: BLUE }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-xl mx-auto space-y-5">

        {!isAdmin && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span>⚠️</span> Only Admin can change denomination settings.
          </div>
        )}

        {/* Current denominations */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Active Denominations</h2>
              <p className="text-xs text-slate-400 mt-0.5">{denominations.length} denomination{denominations.length !== 1 ? "s" : ""} configured</p>
            </div>
            <button
              onClick={resetToDefault}
              disabled={!isAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
            >
              <FaUndo size={10} />
              Reset to Default
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Grid of denominations */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {normalizeCashDenominations(denominations).map((value) => (
                <div
                  key={String(value)}
                  className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5"
                >
                  <span className="text-sm font-bold text-blue-800">₹{formatCashDenomination(value)}</span>
                  <button
                    type="button"
                    onClick={() => removeDenomination(value)}
                    disabled={!isAdmin || denominations.length <= 1}
                    className="ml-2 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-blue-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition disabled:opacity-30"
                    title="Remove"
                  >
                    <FaTrash size={9} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new denomination */}
            <div className="flex gap-2 pt-1">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && isAdmin && addDenomination()}
                placeholder="Add new (e.g. 2000)"
                disabled={!isAdmin}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                type="button"
                onClick={addDenomination}
                disabled={!isAdmin || !newValue.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40"
                style={{ background: BLUE }}
              >
                <FaPlus size={11} />
                Add
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              These denominations appear as rows in the cash counting grid during shift close and day close.
              Add or remove values to match your counter setup.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Preview — Cash Count Grid</h2>
            <p className="text-xs text-slate-400 mt-0.5">How the denomination table will look during cash closing</p>
          </div>
          <div className="p-4">
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-3 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <span>Note / Coin</span>
                <span className="text-center">Count</span>
                <span className="text-right">Amount</span>
              </div>
              {normalizeCashDenominations(denominations).map((denom) => (
                <div key={String(denom)} className="grid grid-cols-3 items-center px-3 py-2 border-t border-slate-100 first:border-0">
                  <span className="text-sm font-semibold text-slate-700">₹{formatCashDenomination(denom)}</span>
                  <div className="flex justify-center">
                    <div className="w-20 h-7 border border-slate-200 rounded-lg bg-slate-50" />
                  </div>
                  <span className="text-right text-sm text-slate-300">—</span>
                </div>
              ))}
              <div className="grid grid-cols-3 items-center px-3 py-2 bg-slate-50 border-t-2 border-slate-200">
                <span className="text-xs font-bold text-slate-700 col-span-2">Total</span>
                <span className="text-right text-sm text-slate-300">—</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
