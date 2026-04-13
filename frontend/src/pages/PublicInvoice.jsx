import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../config/api";

const fmt = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function PublicInvoice() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/invoice/public/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setInvoice(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const subtotal = useMemo(() => {
    return Array.isArray(invoice?.items)
      ? invoice.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      : 0;
  }, [invoice]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">Loading invoice...</div>;
  }

  if (notFound || !invoice) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">Invalid or expired invoice link.</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-slate-900 px-6 py-6 text-white">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Invoice</div>
          <div className="mt-2 text-2xl font-bold">{invoice.invoice_number}</div>
          <div className="mt-1 text-sm text-slate-300">{invoice.created_time}</div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{invoice.customer_name || "Walk-in Customer"}</div>
            <div className="mt-1 text-sm text-slate-500">{invoice.mobile || "No mobile provided"}</div>
          </div>
          <div className="md:text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</div>
            <div className="mt-1 text-base font-semibold text-slate-800">{String(invoice.payment_mode || "cash").toUpperCase()}</div>
            <div className="mt-1 text-sm text-slate-500">Tax: {fmt(invoice.tax_amt)}</div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4 text-right">Rate</th>
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((item) => (
                  <tr key={`${invoice.invoice_number}-${item.item_id}`} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-medium text-slate-700">{item.item_name}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{fmt(item.price)}</td>
                    <td className="py-3 text-right font-semibold text-slate-800">{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-5">
          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Discount</span>
              <span>- {fmt(invoice.discounted_amt)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Tax</span>
              <span>{fmt(invoice.tax_amt)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{fmt(invoice.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
