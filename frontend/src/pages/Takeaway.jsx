import { useEffect, useState } from "react";
import api from "../utils/apiClient";

const STATUS_COLOR = {
  OPEN:   "#3b82f6",
  CLOSED: "#6b7280",
};

export default function Takeaway() {
  const [orders, setOrders]     = useState([]);
  const [items, setItems]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [selCat, setSelCat]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [cart, setCart]         = useState([]);
  const [form, setForm]         = useState({ customer_name: "", mobile: "", notes: "" });
  const [loading, setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState("new"); // new | list

  const load = async () => {
    try {
      const [ordRes, itemRes, catRes] = await Promise.all([
        api.get("/table-billing/takeaway/orders"),
        api.get("/items/"),
        api.get("/category/"),
      ]);
      setOrders(ordRes.data || []);
      setItems((itemRes.data || []).filter((item) => !item?.is_raw_material));
      setCategories(catRes.data || []);
    } catch { /* silent */ }
  };

  useEffect(() => { load(); }, []);

  const filteredItems = items.filter((it) => {
    const matchCat = selCat === "ALL" || String(it.category_id) === String(selCat);
    const matchSearch = it.item_name?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const addToCart = (item) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.item_id === item.item_id);
      if (ex) return prev.map((c) => c.item_id === item.item_id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { item_id: item.item_id, item_name: item.item_name, price: parseFloat(item.price || 0), qty: 1 }];
    });
  };

  const changeQty = (item_id, delta) => {
    setCart((prev) =>
      prev.map((c) => c.item_id === item_id ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
          .filter((c) => c.qty > 0)
    );
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const placeOrder = async () => {
    if (!form.customer_name.trim()) return alert("Customer name required");
    if (cart.length === 0) return alert("Add at least one item");
    setLoading(true);
    try {
      await api.post("/table-billing/takeaway", {
        customer_name: form.customer_name.trim(),
        mobile: form.mobile.trim(),
        notes: form.notes.trim(),
        items: cart.map((c) => ({ item_id: c.item_id, quantity: c.qty })),
      });
      setCart([]);
      setForm({ customer_name: "", mobile: "", notes: "" });
      setActiveTab("list");
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  const completeOrder = async (orderId) => {
    try {
      await api.post(`/table-billing/order/checkout/${orderId}`, {
        payment_mode: "cash",
      });
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Checkout failed");
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Takeaway Orders</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("new")}
            className={`px-4 py-2 rounded font-semibold ${activeTab === "new" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            + New Order
          </button>
          <button
            onClick={() => { setActiveTab("list"); load(); }}
            className={`px-4 py-2 rounded font-semibold ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            Active Orders ({orders.length})
          </button>
        </div>
      </div>

      {/* ── NEW ORDER TAB ── */}
      {activeTab === "new" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Item selector */}
          <div className="xl:col-span-2 bg-white rounded-lg shadow p-4">
            <div className="flex gap-2 mb-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
            </div>
            {/* Category tabs */}
            <div className="flex gap-2 flex-wrap mb-3">
              <button
                onClick={() => setSelCat("ALL")}
                className={`px-3 py-1 rounded text-sm ${selCat === "ALL" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.category_id}
                  onClick={() => setSelCat(c.category_id)}
                  className={`px-3 py-1 rounded text-sm ${selCat === c.category_id ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                >
                  {c.category_name}
                </button>
              ))}
            </div>
            {/* Items grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.item_id}
                  onClick={() => addToCart(item)}
                  className="border rounded-lg p-3 text-left hover:bg-blue-50 hover:border-blue-400 transition"
                >
                  <div className="font-semibold text-sm truncate">{item.item_name}</div>
                  <div className="text-blue-600 font-bold mt-1">₹{parseFloat(item.price || 0).toFixed(2)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart & customer info */}
          <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
            <h2 className="font-bold text-lg border-b pb-2">Order Details</h2>
            <input
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              placeholder="Customer Name *"
              className="border rounded px-3 py-2 text-sm"
            />
            <input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="Mobile"
              className="border rounded px-3 py-2 text-sm"
            />
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Special instructions..."
              rows={2}
              className="border rounded px-3 py-2 text-sm resize-none"
            />

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto max-h-64">
              {cart.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">No items added</p>
              ) : cart.map((c) => (
                <div key={c.item_id} className="flex items-center justify-between py-2 border-b">
                  <div className="flex-1 text-sm font-medium truncate">{c.item_name}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(c.item_id, -1)} className="w-7 h-7 rounded-full bg-gray-200 font-bold text-lg leading-none">−</button>
                    <span className="w-6 text-center font-bold">{c.qty}</span>
                    <button onClick={() => changeQty(c.item_id, 1)} className="w-7 h-7 rounded-full bg-gray-200 font-bold text-lg leading-none">+</button>
                    <span className="w-16 text-right text-sm font-semibold">₹{(c.price * c.qty).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>₹{cartTotal.toFixed(2)}</span>
            </div>

            <button
              onClick={placeOrder}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg text-base disabled:opacity-50"
            >
              {loading ? "Placing..." : "Place Order"}
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE ORDERS TAB ── */}
      {activeTab === "list" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.length === 0 ? (
            <div className="col-span-full text-center text-gray-400 py-16 text-lg">
              No active takeaway orders
            </div>
          ) : orders.map((o) => (
            <div key={o.order_id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold text-lg">{o.token_number || `#${o.order_id}`}</div>
                  <div className="text-sm text-gray-600">{o.customer_name}</div>
                  {o.mobile && <div className="text-xs text-gray-400">{o.mobile}</div>}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: STATUS_COLOR[o.status] + "22", color: STATUS_COLOR[o.status] }}>
                  {o.status}
                </span>
              </div>

              {o.notes && (
                <div className="text-xs text-amber-600 bg-amber-50 rounded p-2 mb-2">
                  📝 {o.notes}
                </div>
              )}

              <div className="text-sm text-gray-500 mb-3">
                {o.items?.length || 0} items · ₹{parseFloat(o.running_total || 0).toFixed(2)}
              </div>

              <button
                onClick={() => completeOrder(o.order_id)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded text-sm"
              >
                Complete & Bill
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
