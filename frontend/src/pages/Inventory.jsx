import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

import { IoTimeOutline, IoClose } from "react-icons/io5";

export default function Inventory() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const branch_id = session?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockData, setStockData] = useState([]);

  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [qtyInput, setQtyInput] = useState({});

  const [showHistory, setShowHistory] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  /* ---------- HELPERS ---------- */
  const getStock = id =>
    stockData.find(s => Number(s.item_id) === Number(id))?.quantity ?? 0;

  /* ---------- LOAD ---------- */
  const loadData = async () => {
    try {
      const [resItems, resCats, param] = await Promise.all([
        authAxios.get("/items/"),
        authAxios.get("/category/"),
        authAxios.get("/parameters/inventory")
      ]);

      setItems(resItems.data || []);
      setCategories(resCats.data || []);
      setInventoryEnabled(param?.data?.value === "YES");

      if (param?.data?.value === "YES" && branch_id) {
        const stock = await authAxios.get("/inventory/list", {
          params: { branch_id }
        });
        setStockData(stock.data || []);
      }
    } catch {
      showToast("Failed to load inventory", "error");
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [branch_id]);

  /* ---------- UPDATE STOCK ---------- */
  const updateStock = async (item_id, qty, mode) => {
    qty = Number(qty);
    if (!qty || qty <= 0) return showToast("Enter valid quantity", "error");

    try {
      await authAxios.post(`/inventory/${mode}`, null, {
        params: { item_id, qty, branch_id }
      });

      setQtyInput(p => ({ ...p, [item_id]: "" }));
      loadData();
      showToast("Stock updated", "success");
    } catch {
      showToast("Stock update failed", "error");
    }
  };

  /* ---------- FILTER ---------- */
  const filtered = items.filter(i =>
    (filterCat === "all" || i.category_id == filterCat) &&
    i.item_name.toLowerCase().includes(search.toLowerCase())
  );

  /* ---------- HISTORY ---------- */
  const openHistory = async item => {
    setShowHistory(true);
    setHistoryItem(item);
    setHistoryLoading(true);

    try {
      const res = await authAxios.get("/inventory/history", {
        params: { item_id: item.item_id, branch_id }
      });
      setHistoryRows(res.data || []);
    } catch {
      setHistoryRows([]);
      showToast("Failed to load history", "error");
    }
    setHistoryLoading(false);
  };

  if (loading) {
    return <div className="p-4 text-xs text-gray-500">Loading inventory…</div>;
  }

  /* ================= UI ================= */
  return (
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">

      {/* HEADER */}
      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-600 hover:text-black"
        >
          ← Back
        </button>

        <h1 className="font-semibold text-gray-800">
          Inventory
        </h1>
      </div>

      {!inventoryEnabled ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">
          Inventory is disabled — enable it in Parameters
        </div>
      ) : (
        <>
          {/* FILTER BAR */}
          <div className="bg-white border rounded-lg p-2 flex gap-2">
            <input
              className="flex-1 border rounded px-2 py-1 text-[11px]"
              placeholder="Search item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select
              className="border rounded px-2 py-1 text-[11px]"
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map(c => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </div>

          {/* ITEMS GRID (COMPACT) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {filtered.map(item => {
              const stock = getStock(item.item_id);

              return (
                <div
                  key={item.item_id}
                  className="bg-white border rounded-md p-2 hover:bg-gray-50 transition"
                >
                  <div className="font-medium truncate">
                    {item.item_name}
                  </div>

                  <div className="text-[10px] text-gray-500 truncate">
                    {categories.find(c => c.category_id === item.category_id)?.category_name}
                  </div>

                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] font-semibold text-emerald-700">
                      Stock: {stock}
                    </span>

                    <button
                      onClick={() => openHistory(item)}
                      className="text-[10px] text-gray-400 hover:text-black"
                    >
                      <IoTimeOutline />
                    </button>
                  </div>

                  <div className="flex gap-1 mt-2">
                    <input
                      type="number"
                      placeholder="Qty"
                      className="w-10 border rounded px-1 py-0.5 text-center text-[11px]"
                      value={qtyInput[item.item_id] || ""}
                      onChange={e =>
                        setQtyInput({ ...qtyInput, [item.item_id]: e.target.value })
                      }
                    />

                    <button
                      onClick={() => updateStock(item.item_id, qtyInput[item.item_id], "add")}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded px-1 py-0.5 text-[10px]"
                    >
                      Add
                    </button>

                    <button
                      onClick={() => updateStock(item.item_id, qtyInput[item.item_id], "remove")}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded px-1 py-0.5 text-[10px]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* HISTORY DRAWER */}
          {showHistory && (
            <div className="fixed inset-0 z-50 flex">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowHistory(false)}
              />

              <div className="relative ml-auto w-[360px] h-full bg-white border-l flex flex-col">
                <div className="px-3 py-2 border-b flex justify-between items-center">
                  <div>
                    <div className="text-[10px] text-gray-400">Stock History</div>
                    <div className="font-medium truncate">
                      {historyItem?.item_name}
                    </div>
                  </div>

                  <button onClick={() => setShowHistory(false)}>
                    <IoClose size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-3 space-y-2 bg-gray-50">
                  {historyLoading && (
                    <p className="text-center text-gray-400 text-xs">
                      Loading…
                    </p>
                  )}

                  {!historyLoading && !historyRows.length && (
                    <p className="text-center text-gray-400 text-xs">
                      No history
                    </p>
                  )}

                  {!historyLoading && historyRows.map((h, i) => (
                    <div
                      key={i}
                      className="bg-white border rounded p-2 text-[11px]"
                    >
                      <div className="flex justify-between">
                        <span
                          className={`text-[10px] font-semibold ${
                            h.mode === "ADD"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {h.mode}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {h.created_time}
                        </span>
                      </div>

                      <div className="mt-1">
                        Qty: <b>{h.qty}</b>
                      </div>

                      <div className="text-[10px] text-gray-500">
                        Ref: {h.ref_no || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
