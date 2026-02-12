import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";

export default function Returns() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const [reason, setReason] = useState("");
  const [qty, setQty] = useState({});

  const [lastReturn, setLastReturn] = useState(null);

  const loadInvoice = async () => {
    if (!invoiceNumber) return showToast("Enter invoice number", "error");
    setLoadingInvoice(true);
    setLastReturn(null);
    try {
      const res = await authAxios.get(`/invoice/by-number/${invoiceNumber}`);
      setInvoice(res.data || null);
      setQty({});
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
      .map(i => ({
        item_id: i.item_id,
        quantity: Number(qty[i.item_id] || 0)
      }))
      .filter(x => x.quantity > 0);

    if (items.length === 0) return showToast("Enter return qty", "error");

    try {
      const res = await authAxios.post("/returns/", {
        invoice_number: invoice.invoice_number,
        reason: reason || null,
        items
      });
      setLastReturn(res.data);
      showToast("Return created", "success");
      setReason("");
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
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">

      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Sales Returns</div>
        <div />
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="min-w-[200px]">
            <label className="text-[10px] text-gray-600">Invoice Number</label>
            <input
              className="w-full border rounded-lg px-2 py-1"
              placeholder="INV-000001"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
            />
          </div>
          <button
            onClick={loadInvoice}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
            disabled={loadingInvoice}
          >
            {loadingInvoice ? "Loading..." : "Load Invoice"}
          </button>
        </div>

        {invoice && (
          <div className="text-gray-700">
            <div className="font-semibold">Invoice: {invoice.invoice_number}</div>
            <div>Customer: {invoice.customer_name || "-"} ({invoice.mobile || "-"})</div>
            <div>
              Total: ₹ {Number(invoice.total_amount || 0).toFixed(2)} | Discount: ₹ {Number(invoice.discounted_amt || 0).toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {invoice && (
        <div className="bg-white border rounded-lg p-3 space-y-2">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[240px]">
              <label className="text-[10px] text-gray-600">Reason (optional)</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Damaged / Wrong item / Customer return..."
              />
            </div>
            <button
              onClick={submit}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
            >
              Create Return
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Sold Qty</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Return Qty</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map(i => (
                  <tr key={i.item_id} className="border-t">
                    <td className="p-2">{i.item_name}</td>
                    <td className="p-2 text-right">{i.quantity}</td>
                    <td className="p-2 text-right">{Number(i.amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min="0"
                        className="w-[90px] border rounded-lg px-2 py-1 text-right"
                        value={qty[i.item_id] || ""}
                        onChange={e =>
                          setQty(prev => ({ ...prev, [i.item_id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastReturn && (
            <div className="border rounded-lg p-3 bg-emerald-50 text-emerald-900">
              <div className="font-bold">Return Created: {lastReturn.return_number}</div>
              <div>Refund Amount: ₹ {Number(lastReturn.refund_amount || 0).toFixed(2)}</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

