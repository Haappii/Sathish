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
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 80mm;
            padding: 8px;
            font-family: monospace;
            font-size: 12px;
          }
          @page { margin: 0; size: 80mm auto; }
        }
      `}</style>

      <div id="gift-card-print-area">
        {selectedPrint && (
          <div>
            <div style={{ textAlign: "center", fontWeight: "bold" }}>
              {shop?.shop_name || "Gift Card"}
            </div>
            <div style={{ textAlign: "center" }}>{shop?.mobile ? `Ph: ${shop.mobile}` : ""}</div>
            <div style={{ marginTop: 6 }}>Gift Card Code: {selectedPrint.code}</div>
            <div>Initial: {money(selectedPrint.initial_amount)}</div>
            <div>Balance: {money(selectedPrint.balance_amount)}</div>
            <div>Expiry: {selectedPrint.expires_on || "-"}</div>
            <div style={{ marginTop: 6 }}>Issued: {selectedPrint.issued_on || "-"}</div>
            <div style={{ marginTop: 8, textAlign: "center" }}>
              Thank you!
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
            <button
              onClick={() => print(printCard)}
              className="px-4 py-2 rounded-lg border text-[12px]"
              type="button"
            >
              Print Last Created
            </button>
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

