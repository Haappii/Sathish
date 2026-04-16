import { useEffect, useState } from "react";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { isHotelShop } from "../utils/shopType";
import { IoTimeOutline, IoClose } from "react-icons/io5";
import { FaBoxOpen } from "react-icons/fa";
import { MdInventory } from "react-icons/md";
import BackButton from "../components/BackButton";

const BLUE = "#0B3C8C";

export default function Inventory() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const branch_id = session?.branch_id ?? null;

  const [isHotel, setIsHotel] = useState(false);
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

  const getStock = id =>
    stockData.find(s => Number(s.item_id) === Number(id))?.quantity ?? 0;

  const loadData = async () => {
    try {
      const [shopRes, resItems, resCats, param] = await Promise.all([
        authAxios.get("/shop/details"),
        authAxios.get("/items/"),
        authAxios.get("/category/"),
        authAxios.get("/parameters/inventory"),
      ]);
      const shopData = shopRes.data || {};
      const hotel = isHotelShop(shopData);
      setIsHotel(hotel);
      const allItems = resItems.data || [];
      const invItems = hotel
        ? allItems.filter(it => !!it?.is_raw_material)
        : allItems.filter(it => !it?.is_raw_material);
      const catIds = new Set(invItems.map(it => String(it?.category_id ?? "")));
      const invCats = (resCats.data || []).filter(c => catIds.has(String(c?.category_id ?? "")));
      setItems(invItems);
      setCategories(invCats);
      setInventoryEnabled(param?.data?.value === "YES");
      if (param?.data?.value === "YES" && branch_id) {
        const stock = await authAxios.get("/inventory/list", { params: { branch_id } });
        setStockData(stock.data || []);
      }
    } catch {
      showToast("Failed to load inventory", "error");
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [branch_id]);

  const updateStock = async (item_id, qty, mode) => {
    qty = Number(qty);
    if (!qty || qty <= 0) return showToast("Enter valid quantity", "error");
    try {
      await authAxios.post(`/inventory/${mode}`, null, { params: { item_id, qty, branch_id } });
      setQtyInput(p => ({ ...p, [item_id]: "" }));
      loadData();
      showToast("Stock updated", "success");
    } catch {
      showToast("Stock update failed", "error");
    }
  };

  const filtered = items.filter(i =>
    (filterCat === "all" || i.category_id == filterCat) &&
    i.item_name.toLowerCase().includes(search.toLowerCase())
  );

  const openHistory = async item => {
    setShowHistory(true);
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const res = await authAxios.get("/inventory/history", { params: { item_id: item.item_id, branch_id } });
      setHistoryRows(res.data || []);
    } catch {
      setHistoryRows([]);
      showToast("Failed to load history", "error");
    }
    setHistoryLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading inventory…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdInventory size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">{isHotel ? "Raw Materials" : "Inventory"}</h1>
              <p className="text-xs text-slate-500">{filtered.length} items</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {!inventoryEnabled ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-600 font-bold text-sm">!</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">Inventory is disabled</p>
              <p className="text-xs text-amber-700">Enable it in Parameters to start tracking stock.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Filter bar */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  placeholder="Search items…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(c => (
                  <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                ))}
              </select>
            </div>

            {/* Items grid */}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
                <FaBoxOpen size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map(item => {
                  const stock = getStock(item.item_id);
                  const catName = categories.find(c => c.category_id === item.category_id)?.category_name || "";
                  const isLow = item.min_stock > 0 ? stock < item.min_stock : false;
                  return (
                    <div key={item.item_id} className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-3 hover:border-slate-200 transition shadow-sm">
                      <div>
                        <p className="font-semibold text-sm text-slate-800 leading-tight line-clamp-2">{item.item_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {catName && <p className="text-xs text-slate-400 truncate">{catName}</p>}
                          {item.unit && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold flex-shrink-0">{item.unit}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className={`flex flex-col px-2.5 py-1 rounded-xl text-xs font-bold ${isLow ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                          <div className="flex items-center gap-1.5">
                            <span>Stock:</span>
                            <span>{stock}{item.unit ? ` ${item.unit}` : ""}</span>
                          </div>
                          {item.min_stock > 0 && (
                            <span className={`text-[10px] font-medium ${isLow ? "text-red-500" : "text-emerald-600"}`}>
                              Min: {item.min_stock}{item.unit ? ` ${item.unit}` : ""}
                            </span>
                          )}
                        </div>
                        <button onClick={() => openHistory(item)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition" title="View history">
                          <IoTimeOutline size={14} />
                        </button>
                      </div>

                      <div className="flex gap-1.5 items-center">
                        <input
                          type="number"
                          placeholder="Qty"
                          className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                          value={qtyInput[item.item_id] || ""}
                          onChange={e => setQtyInput({ ...qtyInput, [item.item_id]: e.target.value })}
                        />
                        <button
                          onClick={() => updateStock(item.item_id, qtyInput[item.item_id], "add")}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-1.5 text-xs font-semibold transition"
                        >
                          + Add
                        </button>
                        <button
                          onClick={() => updateStock(item.item_id, qtyInput[item.item_id], "remove")}
                          className="flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg py-1.5 text-xs font-semibold transition"
                        >
                          – Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHistory(false)} />
          <div className="relative ml-auto w-80 h-full bg-white shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Stock History</p>
                <p className="font-semibold text-slate-800 truncate max-w-[200px]">{historyItem?.item_name}</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                <IoClose size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-2 bg-slate-50">
              {historyLoading && <p className="text-center text-slate-400 text-sm py-8">Loading…</p>}
              {!historyLoading && !historyRows.length && <p className="text-center text-slate-400 text-sm py-8">No history</p>}
              {!historyLoading && historyRows.map((h, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${h.mode === "ADD" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                      {h.mode}
                    </span>
                    <span className="text-xs text-slate-400">{h.created_time}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">Qty: {h.qty}</p>
                  {h.ref_no && <p className="text-xs text-slate-500">Ref: {h.ref_no}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
