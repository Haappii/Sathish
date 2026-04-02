import { useEffect, useState, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

const STATUS_COLOR = {
  PENDING:   { bg: "#ef4444", text: "#fff", label: "PENDING" },
  PREPARING: { bg: "#f97316", text: "#fff", label: "PREPARING" },
  READY:     { bg: "#22c55e", text: "#fff", label: "READY" },
  SERVED:    { bg: "#6b7280", text: "#fff", label: "SERVED" },
};

export default function KitchenDisplay() {
  const [kots, setKots]       = useState([]);
  const [shopId, setShopId]   = useState(null);
  const [branchId, setBranchId] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError]     = useState("");
  const intervalRef           = useRef(null);

  // Read shop/branch from localStorage (set during login)
  useEffect(() => {
    const sid = localStorage.getItem("shop_id");
    const bid = localStorage.getItem("branch_id");
    setShopId(sid);
    setBranchId(bid);
  }, []);

  const fetchKots = async () => {
    if (!shopId || !branchId) return;
    try {
      const res = await axios.get(`${API}/api/kds/live`, {
        params: { shop_id: shopId, branch_id: branchId },
      });
      setKots(res.data.kots || []);
      setLastUpdate(new Date().toLocaleTimeString());
      setError("");
    } catch {
      setError("Could not reach server");
    }
  };

  useEffect(() => {
    if (!shopId || !branchId) return;
    fetchKots();
    intervalRef.current = setInterval(fetchKots, 5000);
    return () => clearInterval(intervalRef.current);
  }, [shopId, branchId]);

  const updateStatus = async (kotId, newStatus) => {
    try {
      await axios.put(`${API}/api/kot/${kotId}/status`, { status: newStatus });
      fetchKots();
    } catch {
      alert("Failed to update status");
    }
  };

  const elapsed = (mins) => {
    if (mins < 1)  return "< 1 min";
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const urgencyBg = (mins) => {
    if (mins >= 20) return "#7f1d1d";
    if (mins >= 10) return "#7c2d12";
    return "#1e3a5f";
  };

  return (
    <div style={{ background: "#111", minHeight: "100vh", color: "#fff", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{
        background: "#1f1f1f", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "2px solid #ef4444",
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
          🍳 KITCHEN DISPLAY
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ color: "#9ca3af", fontSize: 13 }}>
            Auto-refreshes every 5s
          </span>
          {lastUpdate && (
            <span style={{ color: "#22c55e", fontSize: 13 }}>
              Last updated: {lastUpdate}
            </span>
          )}
          {error && (
            <span style={{ color: "#ef4444", fontSize: 13 }}>⚠ {error}</span>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            {Object.entries(STATUS_COLOR).map(([k, v]) => (
              <span key={k} style={{
                background: v.bg, color: v.text,
                padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
              }}>{v.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* KOT Cards */}
      <div style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {kots.length === 0 ? (
          <div style={{
            gridColumn: "1/-1", textAlign: "center",
            color: "#4b5563", fontSize: 32, marginTop: 80,
          }}>
            ✓ No pending orders
          </div>
        ) : kots.map((kot) => {
          const sc = STATUS_COLOR[kot.status] || STATUS_COLOR.PENDING;
          return (
            <div key={kot.kot_id} style={{
              background: urgencyBg(kot.elapsed_minutes),
              border: `2px solid ${sc.bg}`,
              borderRadius: 8, overflow: "hidden",
            }}>
              {/* Card Header */}
              <div style={{
                background: sc.bg, padding: "8px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {kot.kot_number}
                </span>
                <span style={{ fontSize: 13 }}>
                  {kot.table_name ? `Table: ${kot.table_name}` : "Takeaway"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  ⏱ {elapsed(kot.elapsed_minutes)}
                </span>
              </div>

              {/* Items */}
              <div style={{ padding: "10px 14px" }}>
                {kot.items.map((item, idx) => (
                  <div key={idx} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "5px 0",
                    borderBottom: idx < kot.items.length - 1 ? "1px solid #374151" : "none",
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>
                        {item.item_name}
                      </span>
                      {item.notes && (
                        <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
                          📝 {item.notes}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontWeight: 700, fontSize: 18,
                      background: "#374151", padding: "0 10px",
                      borderRadius: 4, minWidth: 36, textAlign: "center",
                    }}>
                      {item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ padding: "8px 14px", display: "flex", gap: 8 }}>
                {kot.status === "PENDING" && (
                  <button
                    onClick={() => updateStatus(kot.kot_id, "PREPARING")}
                    style={{
                      flex: 1, background: "#f97316", color: "#fff",
                      border: "none", borderRadius: 4, padding: "7px 0",
                      fontWeight: 700, cursor: "pointer", fontSize: 13,
                    }}
                  >
                    Start Preparing
                  </button>
                )}
                {kot.status === "PREPARING" && (
                  <button
                    onClick={() => updateStatus(kot.kot_id, "READY")}
                    style={{
                      flex: 1, background: "#22c55e", color: "#fff",
                      border: "none", borderRadius: 4, padding: "7px 0",
                      fontWeight: 700, cursor: "pointer", fontSize: 13,
                    }}
                  >
                    Mark Ready ✓
                  </button>
                )}
                {kot.status === "READY" && (
                  <button
                    onClick={() => updateStatus(kot.kot_id, "SERVED")}
                    style={{
                      flex: 1, background: "#6b7280", color: "#fff",
                      border: "none", borderRadius: 4, padding: "7px 0",
                      fontWeight: 700, cursor: "pointer", fontSize: 13,
                    }}
                  >
                    Served ✓
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
