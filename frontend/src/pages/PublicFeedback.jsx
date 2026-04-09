import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../config/api";

const STARS = [1, 2, 3, 4, 5];
const LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very Good", 5: "Excellent" };
const STAR_COLOR = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#10b981" };

export default function PublicFeedback() {
  const [params] = useSearchParams();
  const shopId   = params.get("shop_id");
  const invoiceNo = params.get("invoice_no") || "";

  const [shop, setShop]         = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm]         = useState({ customer_name: "", mobile: "", rating: 0, comment: "" });
  const [hover, setHover]       = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    if (!shopId) { setNotFound(true); return; }
    fetch(`${API_BASE}/feedback/shop-info/${shopId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setShop)
      .catch(() => setNotFound(true));
  }, [shopId]);

  const submit = async () => {
    if (!form.rating) return setError("Please select a rating");
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/feedback/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: Number(shopId),
          invoice_no: invoiceNo || null,
          customer_name: form.customer_name.trim() || null,
          mobile: form.mobile.trim() || null,
          rating: form.rating,
          comment: form.comment.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-500 text-sm">Invalid feedback link.</div>
    </div>
  );

  if (!shop) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-sm text-gray-400">Loading...</div>
    </div>
  );

  const activeColor = STAR_COLOR[hover || form.rating] || "#fbbf24";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)" }} className="px-8 py-6 text-center">
            <div className="text-xs tracking-widest text-yellow-400 uppercase font-semibold mb-1">Customer Feedback</div>
            <div className="text-xl font-bold text-white">{shop.shop_name}</div>
            {invoiceNo && <div className="text-xs text-white/50 mt-1">Invoice: {invoiceNo}</div>}
          </div>

          {submitted ? (
            <div className="px-8 py-12 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <div className="text-lg font-bold text-gray-800 mb-2">Thank You!</div>
              <div className="text-sm text-gray-500">Your feedback has been submitted. We appreciate your time.</div>
            </div>
          ) : (
            <div className="px-8 py-6 space-y-5">
              {/* Star rating */}
              <div className="text-center">
                <div className="text-sm font-semibold text-gray-700 mb-3">How was your experience?</div>
                <div className="flex justify-center gap-2">
                  {STARS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, rating: s }))}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <svg width="36" height="36" viewBox="0 0 24 24" fill={s <= (hover || form.rating) ? activeColor : "#e5e7eb"} xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </button>
                  ))}
                </div>
                {(hover || form.rating) > 0 && (
                  <div className="text-sm font-semibold mt-2" style={{ color: activeColor }}>
                    {LABELS[hover || form.rating]}
                  </div>
                )}
              </div>

              {/* Fields */}
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-50"
                placeholder="Your name (optional)"
                value={form.customer_name}
                onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
              />
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-50"
                placeholder="Mobile (optional)"
                value={form.mobile}
                onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))}
              />
              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-50 resize-none"
                rows={3}
                placeholder="Write your feedback... (optional)"
                value={form.comment}
                onChange={e => setForm(p => ({ ...p, comment: e.target.value }))}
              />

              {error && <div className="text-xs text-red-500 text-center">{error}</div>}

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)" }}
              >
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          )}
        </div>
        <div className="text-center text-xs text-gray-400 mt-4">Powered by Haappii Billing</div>
      </div>
    </div>
  );
}
