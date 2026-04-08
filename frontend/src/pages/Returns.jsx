import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";

const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";

export default function Returns() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isHotel = (localStorage.getItem("billing_type") || "").toLowerCase() === "hotel";

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const [returnType, setReturnType] = useState("REFUND");
  const [refundMode, setRefundMode] = useState("CASH");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState({});
  const [condition, setCondition] = useState({});

  const [lastReturn, setLastReturn] = useState(null);

  const loadInvoice = async () => {
    if (!invoiceNumber) return showToast("Enter invoice number", "error");
    setLoadingInvoice(true);
    setLastReturn(null);
    try {
      const res = await authAxios.get(`/invoice/by-number/${invoiceNumber}`);
      setInvoice(res.data || null);
      setQty({});
      setCondition({});
    } catch (err) {
      setInvoice(null);
      const msg = err?.response?.data?.detail || "Invoice not found";
      showToast(msg, "error");
    }
    setLoadingInvoice(false);
  };

  const submit = async () => {
    if (!invoice?.invoice_number) return showToast("Load an invoice first", "error");

    const items = (invoice.items || [])
      .map(i => {
        const cond = condition[i.item_id] || "GOOD";
        // Hotel: food items are never added back to stock regardless of condition
        // Store: GOOD → restock; DAMAGED → do not restock
        const restock = isHotel ? false : cond !== "DAMAGED";
        return {
          item_id: i.item_id,
          quantity: Number(qty[i.item_id] || 0),
          condition: isHotel ? (cond === "GOOD" ? "GOOD" : "DAMAGED") : cond,
          restock,
        };
      })
      .filter(x => x.quantity > 0);

    if (items.length === 0) return showToast("Enter return qty", "error");

    if (refundMode === "STORE_CREDIT" && /^9{9,}$/.test(String(invoice.mobile || ""))) {
      return showToast("Valid customer mobile required for store credit", "error");
    }

    try {
      const res = await authAxios.post("/returns/", {
        invoice_number: invoice.invoice_number,
        reason_code: reasonCode || null,
        reason: reason || null,
        note: note || null,
        return_type: returnType,
        refund_mode: refundMode,
        items
      });
      setLastReturn(res.data);
      showToast("Return created", "success");
      setReasonCode("");
      setReason("");
      setNote("");
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Return failed";
      showToast(msg, "error");
    }
  };

  useEffect(() => {
    const onEnter = e => e.key === "Enter" && loadInvoice();
    window.addEventListener("keydown", onEnter);
    return () => window.removeEventListener("keydown", onEnter);
  }, [invoiceNumber]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Sales Returns</h1>
          <p className="text-[11px] text-gray-400">Process refunds and exchanges</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Invoice Lookup */}
        <div className="bg-white border rounded-2xl shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Step 1 — Load Invoice</p>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className={labelCls}>Invoice Number</label>
              <input
                className={inputCls}
                placeholder="e.g. INV-000001"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
              />
            </div>
            <button
              onClick={loadInvoice}
              disabled={loadingInvoice}
              className="px-5 py-1.5 rounded-xl text-[12px] font-semibold text-white transition disabled:opacity-60"
              style={{ backgroundColor: "#0B3C8C" }}
            >
              {loadingInvoice ? "Loading..." : "Load Invoice"}
            </button>
          </div>

          {invoice && (
            <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className={labelCls}>Invoice</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className={labelCls}>Customer</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{invoice.customer_name || "—"}</p>
              </div>
              <div>
                <p className={labelCls}>Mobile</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{invoice.mobile || "—"}</p>
              </div>
              <div>
                <p className={labelCls}>Total Amount</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">₹{Number(invoice.total_amount || 0).toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Return Details */}
        {invoice && (
          <>
            <div className="bg-white border rounded-2xl shadow-sm p-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Step 2 — Return Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Return Type</label>
                  <select className={inputCls} value={returnType} onChange={e => setReturnType(e.target.value)}>
                    <option value="REFUND">Refund</option>
                    <option value="EXCHANGE">Exchange</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Refund Mode</label>
                  <select className={inputCls} value={refundMode} onChange={e => setRefundMode(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="STORE_CREDIT">Store Credit (Wallet)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Reason Code</label>
                  <select className={inputCls} value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
                    <option value="">Select (optional)</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="WRONG_ITEM">Wrong Item</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="CUSTOMER_CHANGED_MIND">Customer Changed Mind</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Reason (optional)</label>
                  <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Notes about return..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Internal Note (optional)</label>
                  <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="For staff reference..." />
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Step 3 — Select Items to Return</p>
                <button
                  onClick={submit}
                  className="px-5 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
                >
                  Create Return
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Item</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Sold Qty</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Amount</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Condition</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(invoice.items || []).map((i, idx) => (
                      <tr key={i.item_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{i.item_name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{i.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">₹{Number(i.amount || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          <select
                            value={condition[i.item_id] || "GOOD"}
                            onChange={e => setCondition(prev => ({ ...prev, [i.item_id]: e.target.value }))}
                            className="border border-gray-200 rounded-xl px-2 py-1 text-[11px] bg-gray-50 focus:outline-none"
                          >
                            {isHotel ? (
                              <>
                                <option value="GOOD">Good condition</option>
                                <option value="BAD">Bad (trash)</option>
                              </>
                            ) : (
                              <>
                                <option value="GOOD">Good</option>
                                <option value="DAMAGED">Damaged</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            className="w-20 border border-gray-200 rounded-xl px-2 py-1 text-[12px] text-right bg-gray-50 focus:outline-none"
                            value={qty[i.item_id] || ""}
                            onChange={e => setQty(prev => ({ ...prev, [i.item_id]: e.target.value }))}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Success Banner */}
            {lastReturn && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm flex-shrink-0">✓</div>
                <div>
                  <p className="text-[12px] font-semibold text-emerald-800">Return Created: {lastReturn.return_number}</p>
                  {String(lastReturn.refund_mode || "").toUpperCase() === "STORE_CREDIT" && (
                    <p className="text-[11px] text-emerald-600">Credited to customer wallet</p>
                  )}
                  <p className="text-[11px] text-emerald-600">Refund Amount: ₹{Number(lastReturn.refund_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
