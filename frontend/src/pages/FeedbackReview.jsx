import { useEffect, useState } from "react";
import api from "../utils/apiClient";
import BackButton from "../components/BackButton";
import { useToast } from "../components/Toast";

const STAR_COLOR = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#10b981" };
const STAR_LABEL = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very Good", 5: "Excellent" };

function Stars({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <svg key={s} width="14" height="14" viewBox="0 0 24 24"
          fill={s <= rating ? STAR_COLOR[rating] : "#e5e7eb"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

export default function FeedbackReview() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterRating, setFilterRating] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [sumRes, listRes] = await Promise.all([
        api.get("/feedback/summary"),
        api.get("/feedback/list", { params: { rating: filterRating || undefined, limit: 200 } }),
      ]);
      setSummary(sumRes.data);
      setList(listRes.data?.items || []);
    } catch {
      showToast("Failed to load feedback", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterRating]);

  const avgColor = summary?.average >= 4 ? "#10b981" : summary?.average >= 3 ? "#eab308" : "#ef4444";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Customer Feedback</h1>
          <p className="text-[11px] text-gray-400">{list.length} review{list.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-lg border bg-white text-[12px] shadow-sm">Refresh</button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border rounded-2xl p-4 shadow-sm text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Total Reviews</div>
              <div className="text-2xl font-black text-gray-800">{summary.total}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4 shadow-sm text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Avg Rating</div>
              <div className="text-2xl font-black" style={{ color: avgColor }}>{summary.average} ★</div>
            </div>
            {[5, 4, 3, 2, 1].slice(0, 2).map(r => (
              <div key={r} className="bg-white border rounded-2xl p-4 shadow-sm">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">{STAR_LABEL[r]}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{
                      width: summary.total ? `${(summary.by_rating[r] / summary.total) * 100}%` : "0%",
                      background: STAR_COLOR[r],
                    }}/>
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-5">{summary.by_rating[r]}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rating breakdown bar */}
        {summary && (
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-600 mb-3">Rating Breakdown</div>
            <div className="space-y-2">
              {[5,4,3,2,1].map(r => (
                <div key={r} className="flex items-center gap-3 text-[12px]">
                  <div className="flex items-center gap-1 w-16 shrink-0">
                    <span className="font-semibold text-gray-700">{r}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={STAR_COLOR[r]}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <span className="text-gray-400 text-[10px]">({summary.by_rating[r]})</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-2.5 rounded-full transition-all" style={{
                      width: summary.total ? `${(summary.by_rating[r] / summary.total) * 100}%` : "0%",
                      background: STAR_COLOR[r],
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 font-medium">Filter:</span>
          {["", "5", "4", "3", "2", "1"].map(r => (
            <button key={r} onClick={() => setFilterRating(r)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${filterRating === r ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {r ? `${r} ★` : "All"}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading...</div>
          ) : list.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">No feedback yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {list.map(fb => (
                <div key={fb.feedback_id} className="px-4 py-3 flex gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                    style={{ background: STAR_COLOR[fb.rating] }}>
                    {fb.rating}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-800">
                          {fb.customer_name || "Anonymous"}
                        </span>
                        {fb.mobile && <span className="text-[11px] text-gray-400">{fb.mobile}</span>}
                        {fb.invoice_no && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2 py-0.5 font-medium">
                            #{fb.invoice_no}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{fb.created_at}</span>
                    </div>
                    <div className="mt-0.5 mb-1"><Stars rating={fb.rating} /></div>
                    {fb.comment && (
                      <p className="text-[12px] text-gray-600 leading-relaxed">{fb.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
