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
        note: createForm.note || null,
      });
      const card = res?.data || null;
      showToast(card?.code ? `Gift card created: ${card.code}` : "Gift card created", "success");
      setCreateForm({ amount: "", expires_on: "", customer_name: "", mobile: "", note: "" });
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
          body * { visibility: hidden; }
          #gift-card-print-area, #gift-card-print-area * { visibility: visible; }
          #gift-card-print-area {
            display: flex !important;
            position: fixed;
            inset: 0;
            align-items: center;
            justify-content: center;
            background: #f8f8f8;
          }
          @page { margin: 0; size: A4 portrait; }
        }
      `}</style>

      <div id="gift-card-print-area">
        {selectedPrint && (
          <div style={{
            width: "176mm",
            height: "102mm",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f3460 100%)",
            color: "white",
            padding: "22px 26px",
            fontFamily: "Arial, Helvetica, sans-serif",
            position: "relative",
            overflow: "hidden",
            boxSizing: "border-box",
          }}>
            {/* Decorative circles */}
            <div style={{ position:"absolute", right:"-40px", top:"-40px", width:"150px", height:"150px", borderRadius:"50%", background:"rgba(255,215,0,0.07)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", right:"60px", bottom:"-30px", width:"100px", height:"100px", borderRadius:"50%", background:"rgba(255,215,0,0.05)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", left:"-20px", bottom:"-20px", width:"80px", height:"80px", borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />

            {/* Header row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:"8px", letterSpacing:"4px", color:"#fbbf24", textTransform:"uppercase", marginBottom:"3px" }}>✦ Gift Card ✦</div>
                <div style={{ fontSize:"17px", fontWeight:"800", color:"white", lineHeight:1.1 }}>{shop?.shop_name || "Store"}</div>
                {shop?.mobile && (
                  <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.45)", marginTop:"2px" }}>{shop.mobile}</div>
                )}
              </div>
              <div style={{
                background: selectedPrint.status === "ACTIVE" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                border: `1px solid ${selectedPrint.status === "ACTIVE" ? "rgba(52,211,153,0.6)" : "rgba(248,113,113,0.6)"}`,
                borderRadius: "20px",
                padding: "4px 13px",
                fontSize: "8px",
                fontWeight: "700",
                color: selectedPrint.status === "ACTIVE" ? "#6ee7b7" : "#fca5a5",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
              }}>
                {selectedPrint.status}
              </div>
            </div>

            {/* Amount */}
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize:"8px", color:"rgba(255,255,255,0.45)", letterSpacing:"2px", textTransform:"uppercase" }}>Gift Value</div>
              <div style={{ fontSize:"34px", fontWeight:"900", color:"#fbbf24", lineHeight:1.1, marginTop:"2px" }}>
                Rs.&nbsp;{Number(selectedPrint.initial_amount || 0).toFixed(2)}
              </div>
              {Number(selectedPrint.balance_amount) !== Number(selectedPrint.initial_amount) && (
                <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.55)", marginTop:"2px" }}>
                  Remaining balance: Rs. {Number(selectedPrint.balance_amount || 0).toFixed(2)}
                </div>
              )}
            </div>

            {/* Code */}
            <div style={{ marginTop:"14px", display:"flex", alignItems:"center", gap:"10px" }}>
              <div>
                <div style={{ fontSize:"8px", color:"rgba(255,255,255,0.45)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"4px" }}>Card Code</div>
                <div style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(251,191,36,0.5)",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontFamily: "Courier New, monospace",
                  fontSize: "15px",
                  fontWeight: "700",
                  letterSpacing: "4px",
                  color: "white",
                  display: "inline-block",
                }}>
                  {selectedPrint.code}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              position:"absolute", bottom:"18px", left:"26px", right:"26px",
              display:"flex", justifyContent:"space-between", alignItems:"flex-end",
              borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:"10px",
            }}>
              <div>
                {selectedPrint.customer_name && (
                  <div style={{ fontSize:"11px", fontWeight:"600", color:"rgba(255,255,255,0.8)" }}>{selectedPrint.customer_name}</div>
                )}
                {selectedPrint.mobile && (
                  <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.45)" }}>{selectedPrint.mobile}</div>
                )}
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.4)" }}>Issued: {selectedPrint.issued_on || "—"}</div>
                {selectedPrint.expires_on && (
                  <div style={{ fontSize:"9px", color:"#fca5a5", marginTop:"2px" }}>Valid till: {selectedPrint.expires_on}</div>
                )}
                {selectedPrint.note && (
                  <div style={{ fontSize:"8px", color:"rgba(255,255,255,0.35)", marginTop:"2px", maxWidth:"100px", textAlign:"right" }}>{selectedPrint.note}</div>
                )}
              </div>
            </div>
          </div>
        )}
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
                background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f3460 100%)",
                color:"white",
                padding:"14px 16px",
                fontFamily:"Arial,sans-serif",
                position:"relative",
                overflow:"hidden",
              }}>
                <div style={{position:"absolute",right:"-15px",top:"-15px",width:"70px",height:"70px",borderRadius:"50%",background:"rgba(255,215,0,0.08)"}}/>
                <div style={{fontSize:"7px",letterSpacing:"3px",color:"#fbbf24",textTransform:"uppercase",marginBottom:"2px"}}>✦ Gift Card ✦</div>
                <div style={{fontSize:"13px",fontWeight:"800",color:"white"}}>{shop?.shop_name || "Store"}</div>
                <div style={{fontSize:"22px",fontWeight:"900",color:"#fbbf24",lineHeight:1.1,margin:"8px 0 6px"}}>
                  Rs. {Number(printCard.initial_amount||0).toFixed(2)}
                </div>
                <div style={{
                  background:"rgba(255,255,255,0.1)",border:"1px solid rgba(251,191,36,0.5)",
                  borderRadius:"6px",padding:"4px 10px",fontFamily:"monospace",
                  fontSize:"12px",fontWeight:"700",letterSpacing:"3px",color:"white",display:"inline-block",
                }}>
                  {printCard.code}
                </div>
                {printCard.expires_on && (
                  <div style={{fontSize:"8px",color:"#fca5a5",marginTop:"6px"}}>Valid till: {printCard.expires_on}</div>
                )}
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

