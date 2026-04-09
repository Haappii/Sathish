import { useEffect, useMemo, useState } from "react";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import { modulesToPermMap } from "../utils/navigationMenu";

const money = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

export default function GiftCards() {
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [shop, setShop] = useState({});
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [createForm, setCreateForm] = useState({
    amount: "",
    expires_on: "",
    customer_name: "",
    mobile: "",
    customer_email: "",
    note: "",
  });

  const [redeemForm, setRedeemForm] = useState({
    code: "",
    amount: "",
  });

  const [printCard, setPrintCard] = useState(null);

  useEffect(() => {
    api
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.gift_cards?.can_read));
        setCanWrite(Boolean(map?.gift_cards?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  useEffect(() => {
    api.get("/shop/details").then((r) => setShop(r?.data || {})).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/gift-cards/list", {
        params: {
          q: q.trim() || undefined,
          status: status || undefined,
          limit: 200,
        },
      });
      setList(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setList([]);
      showToast(e?.response?.data?.detail || "Failed to load gift cards", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const selectedPrint = useMemo(() => {
    if (!printCard) return null;
    const code = String(printCard.code || "").toUpperCase();
    return list.find((x) => String(x.code || "").toUpperCase() === code) || printCard;
  }, [printCard, list]);

  const createCard = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    const amt = Number(createForm.amount || 0);
    if (!amt || amt <= 0) return showToast("Enter amount", "error");

    try {
      const res = await api.post("/gift-cards/create", {
        amount: amt,
        expires_on: createForm.expires_on || null,
        customer_name: createForm.customer_name || null,
        mobile: createForm.mobile || null,
        customer_email: createForm.customer_email || null,
        note: createForm.note || null,
      });
      const card = res?.data || null;
      const emailSent = createForm.customer_email ? ` • Email sent to ${createForm.customer_email}` : "";
      showToast(card?.code ? `Gift card created: ${card.code}${emailSent}` : "Gift card created", "success");
      setCreateForm({ amount: "", expires_on: "", customer_name: "", mobile: "", customer_email: "", note: "" });
      setPrintCard(card);
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Create failed", "error");
    }
  };

  const redeem = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    const code = String(redeemForm.code || "").trim();
    const amt = Number(redeemForm.amount || 0);
    if (!code) return showToast("Enter gift card code", "error");
    if (!amt || amt <= 0) return showToast("Enter redeem amount", "error");

    try {
      await api.post("/gift-cards/redeem", {
        code,
        amount: amt,
        ref_type: "MANUAL",
      });
      showToast("Redeemed", "success");
      setRedeemForm({ code: "", amount: "" });
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Redeem failed", "error");
    }
  };

  const print = (card) => {
    setPrintCard(card);
    setTimeout(() => window.print(), 150);
  };

  if (allowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading...
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        #gift-card-print-area { display: none; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body * { visibility: hidden; }
          #gift-card-print-area {
            visibility: visible !important;
            display: flex !important;
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            align-items: center !important;
            justify-content: center !important;
            background: #e8edf2 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            z-index: 99999 !important;
          }
          #gift-card-print-area * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div id="gift-card-print-area">
        {selectedPrint && (() => {
          const isActive = selectedPrint.status === "ACTIVE";
          const hasRemaining = Number(selectedPrint.balance_amount) !== Number(selectedPrint.initial_amount);
          return (
            <div className="gc-card" style={{
              width: "160mm",
              background: "linear-gradient(135deg, #0f172a 0%, #1a3353 45%, #0e2a4a 100%)",
              borderRadius: "16px",
              fontFamily: "Arial, Helvetica, sans-serif",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            }}>

              {/* Gold top bar */}
              <div style={{ height: "5px", background: "linear-gradient(90deg, #b8860b, #fbbf24, #d4a017, #fbbf24, #b8860b)" }} />

              {/* Main content */}
              <div style={{ padding: "24px 28px 0" }}>

                {/* Top row: label + status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: "linear-gradient(135deg, #b8860b, #fbbf24)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "16px", fontWeight: "900", color: "#0f172a",
                    }}>✦</div>
                    <div>
                      <div style={{ fontSize: "7px", letterSpacing: "3px", color: "#fbbf24", textTransform: "uppercase", fontWeight: "700" }}>Gift Card</div>
                      <div style={{ fontSize: "15px", fontWeight: "800", color: "white", lineHeight: 1.1, marginTop: "1px" }}>{shop?.shop_name || "Store"}</div>
                    </div>
                  </div>
                  <div style={{
                    background: isActive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
                    border: `1.5px solid ${isActive ? "#34d399" : "#f87171"}`,
                    borderRadius: "20px", padding: "5px 14px",
                    fontSize: "9px", fontWeight: "800",
                    color: isActive ? "#6ee7b7" : "#fca5a5",
                    letterSpacing: "2px", textTransform: "uppercase",
                  }}>{selectedPrint.status}</div>
                </div>

                {/* Divider */}
                <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", marginBottom: "18px" }} />

                {/* Amount section */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "8px", letterSpacing: "2.5px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: "4px" }}>Gift Value</div>
                    <div style={{ fontSize: "40px", fontWeight: "900", color: "#fbbf24", lineHeight: 1, letterSpacing: "-1px" }}>
                      Rs.&nbsp;{Number(selectedPrint.initial_amount || 0).toFixed(2)}
                    </div>
                    {hasRemaining && (
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
                        Remaining: Rs. {Number(selectedPrint.balance_amount || 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                  {/* Decorative circle */}
                  <div style={{
                    width: "64px", height: "64px", borderRadius: "50%",
                    border: "2px solid rgba(251,191,36,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "50%",
                      background: "rgba(251,191,36,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "20px",
                    }}>🎁</div>
                  </div>
                </div>

                {/* Code */}
                <div style={{ marginBottom: "22px" }}>
                  <div style={{ fontSize: "8px", letterSpacing: "2.5px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: "8px" }}>Card Code</div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: "12px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1.5px solid rgba(251,191,36,0.4)",
                    borderRadius: "10px", padding: "10px 20px",
                  }}>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "20px", fontWeight: "800", letterSpacing: "5px", color: "#fbbf24" }}>
                      {selectedPrint.code}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                background: "#0a1628",
                padding: "14px 28px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderTop: "2px solid #1e3a5f",
              }}>
                <div>
                  {selectedPrint.customer_name
                    ? <div style={{ fontSize: "12px", fontWeight: "700", color: "#ffffff" }}>{selectedPrint.customer_name}</div>
                    : <div style={{ fontSize: "11px", color: "#6b7280" }}>—</div>
                  }
                  {selectedPrint.mobile && <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>{selectedPrint.mobile}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {selectedPrint.issued_on && (
                    <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "4px" }}>
                      Issued: <strong style={{ color: "#d1d5db" }}>{selectedPrint.issued_on}</strong>
                    </div>
                  )}
                  {selectedPrint.expires_on
                    ? <div style={{ fontSize: "11px", color: "#fbbf24", fontWeight: "700" }}>Valid till: {selectedPrint.expires_on}</div>
                    : <div style={{ fontSize: "10px", color: "#6b7280" }}>No expiry</div>
                  }
                </div>
              </div>

              {/* Gold bottom bar */}
              <div style={{ height: "4px", background: "linear-gradient(90deg, #b8860b, #fbbf24, #d4a017, #fbbf24, #b8860b)" }} />
            </div>
          );
        })()}
      </div>

      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-slate-800">Gift Cards</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-2 text-[12px]">
          <div className="text-sm font-semibold">Generate</div>
          <input
            type="number"
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Amount"
            value={createForm.amount}
            onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <input
            type="date"
            className="border rounded-lg px-2 py-2 w-full"
            value={createForm.expires_on}
            onChange={(e) => setCreateForm((p) => ({ ...p, expires_on: e.target.value }))}
          />
          <input
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Customer name (optional)"
            value={createForm.customer_name}
            onChange={(e) => setCreateForm((p) => ({ ...p, customer_name: e.target.value }))}
          />
          <input
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Mobile (optional)"
            value={createForm.mobile}
            onChange={(e) => setCreateForm((p) => ({ ...p, mobile: e.target.value }))}
          />
          <input
            type="email"
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Customer email (send gift card)"
            value={createForm.customer_email}
            onChange={(e) => setCreateForm((p) => ({ ...p, customer_email: e.target.value }))}
          />
          <textarea
            className="border rounded-lg px-2 py-2 w-full"
            rows={2}
            placeholder="Note (optional)"
            value={createForm.note}
            onChange={(e) => setCreateForm((p) => ({ ...p, note: e.target.value }))}
          />
          <button
            disabled={!canWrite}
            onClick={createCard}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            Create Gift Card
          </button>
          {printCard?.code && (
            <div className="mt-2 space-y-2">
              {/* Card preview */}
              <div style={{
                borderRadius:"12px",
                background:"linear-gradient(135deg,#0f172a 0%,#1a3353 45%,#0e2a4a 100%)",
                overflow:"hidden", fontFamily:"Arial,sans-serif",
              }}>
                <div style={{height:"3px",background:"linear-gradient(90deg,#b8860b,#fbbf24,#d4a017,#fbbf24,#b8860b)"}}/>
                <div style={{padding:"12px 14px"}}>
                  <div style={{fontSize:"6px",letterSpacing:"3px",color:"#fbbf24",textTransform:"uppercase",fontWeight:"700",marginBottom:"2px"}}>✦ Gift Card</div>
                  <div style={{fontSize:"12px",fontWeight:"800",color:"white",marginBottom:"8px"}}>{shop?.shop_name || "Store"}</div>
                  <div style={{fontSize:"8px",color:"rgba(255,255,255,0.4)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"2px"}}>Gift Value</div>
                  <div style={{fontSize:"22px",fontWeight:"900",color:"#fbbf24",lineHeight:1,marginBottom:"8px"}}>
                    Rs. {Number(printCard.initial_amount||0).toFixed(2)}
                  </div>
                  <div style={{
                    display:"inline-block",background:"rgba(255,255,255,0.07)",
                    border:"1.5px solid rgba(251,191,36,0.4)",borderRadius:"7px",
                    padding:"5px 12px",fontFamily:"Courier New,monospace",
                    fontSize:"13px",fontWeight:"800",letterSpacing:"4px",color:"#fbbf24",
                  }}>{printCard.code}</div>
                </div>
                <div style={{
                  background:"rgba(0,0,0,0.3)",padding:"8px 14px",
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  borderTop:"1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{fontSize:"10px",color:"rgba(255,255,255,0.5)"}}>{printCard.customer_name || "—"}</div>
                  {printCard.expires_on && <div style={{fontSize:"9px",color:"#fca5a5",fontWeight:"600"}}>Till: {printCard.expires_on}</div>}
                </div>
                <div style={{height:"3px",background:"linear-gradient(90deg,#b8860b,#fbbf24,#d4a017,#fbbf24,#b8860b)"}}/>
              </div>
              <button
                onClick={() => print(printCard)}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 text-white text-[12px] font-semibold hover:bg-slate-700 transition"
                type="button"
              >
                🖨️ Print Gift Card
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2 text-[12px]">
          <div className="text-sm font-semibold">Redeem (Manual)</div>
          <input
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Gift card code"
            value={redeemForm.code}
            onChange={(e) => setRedeemForm((p) => ({ ...p, code: e.target.value }))}
          />
          <input
            type="number"
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Amount"
            value={redeemForm.amount}
            onChange={(e) => setRedeemForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <button
            disabled={!canWrite}
            onClick={redeem}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[12px] disabled:opacity-60"
          >
            Redeem
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2 text-[12px]">
          <div className="text-sm font-semibold">Search</div>
          <input
            className="border rounded-lg px-2 py-2 w-full"
            placeholder="Code or mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="border rounded-lg px-2 py-2 w-full"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="REDEEMED">REDEEMED</option>
            <option value="VOID">VOID</option>
          </select>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg border text-[12px]"
            type="button"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        {loading ? (
          <div className="p-3 text-[12px] text-slate-500">Loading...</div>
        ) : list.length === 0 ? (
          <div className="p-3 text-[12px] text-slate-500">No gift cards</div>
        ) : (
          <table className="min-w-[900px] w-full text-left text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Initial</th>
                <th className="p-2 text-right">Balance</th>
                <th className="p-2">Expiry</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Issued</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.gift_card_id} className="border-t">
                  <td className="p-2 font-semibold">{r.code}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2 text-right">{money(r.initial_amount)}</td>
                  <td className="p-2 text-right font-bold">{money(r.balance_amount)}</td>
                  <td className="p-2">{r.expires_on || "-"}</td>
                  <td className="p-2">{r.customer_name || r.mobile || "-"}</td>
                  <td className="p-2">{r.issued_on || "-"}</td>
                  <td className="p-2">
                    <button
                      className="px-3 py-1.5 rounded-lg border text-[12px] hover:bg-gray-50"
                      type="button"
                      onClick={() => print(r)}
                    >
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

