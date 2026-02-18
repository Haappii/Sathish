import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";

const publicApi = axios.create({ baseURL: API_BASE });
const BLUE = "#0B3C8C";

const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

export default function PublicQrMenu() {
  const { token } = useParams();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [table, setTable] = useState({});
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [step, setStep] = useState("INFO"); // INFO -> MENU -> SENT
  const [customer, setCustomer] = useState({
    customer_name: "",
    mobile: "",
    email: "",
  });

  const [activeCat, setActiveCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({}); // { [item_id]: qty }
  const [submitting, setSubmitting] = useState(false);
  const [sentOrderId, setSentOrderId] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await publicApi.get(`/public/qr/${token}/bootstrap`);
        if (!mounted) return;
        setShop(res.data?.shop || {});
        setBranch(res.data?.branch || {});
        setTable(res.data?.table || {});
        setCategories(res.data?.categories || []);
        setItems(res.data?.items || []);
      } catch (e) {
        if (!mounted) return;
        setErr(e?.response?.data?.detail || "Invalid QR code");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const itemsById = useMemo(() => {
    const map = {};
    for (const it of items || []) map[it.item_id] = it;
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = String(search || "").toLowerCase();
    return (items || []).filter((i) => {
      const nameOk = String(i.item_name || "").toLowerCase().includes(q);
      const catOk = activeCat === "ALL" || i.category_id === activeCat;
      return nameOk && catOk;
    });
  }, [items, activeCat, search]);

  const cartRows = useMemo(() => {
    const rows = [];
    for (const [id, qty] of Object.entries(cart || {})) {
      const itemId = Number(id);
      const q = Number(qty || 0);
      if (!q || q <= 0) continue;
      const it = itemsById[itemId];
      if (!it) continue;
      rows.push({ ...it, quantity: q });
    }
    return rows.sort((a, b) => String(a.item_name || "").localeCompare(String(b.item_name || "")));
  }, [cart, itemsById]);

  const cartTotal = useMemo(() => {
    return cartRows.reduce(
      (s, r) => s + Number(r.price || 0) * Number(r.quantity || 0),
      0
    );
  }, [cartRows]);

  const inc = (itemId, delta) => {
    setCart((c) => {
      const next = { ...(c || {}) };
      const prev = Number(next[itemId] || 0);
      const v = prev + delta;
      if (v <= 0) delete next[itemId];
      else next[itemId] = v;
      return next;
    });
  };

  const proceedToMenu = () => {
    const name = String(customer.customer_name || "").trim();
    const mobile = onlyDigits(customer.mobile);
    const email = String(customer.email || "").trim();

    if (!name) {
      showToast("Enter your name", "error");
      return;
    }
    if (mobile.length < 8) {
      showToast("Enter a valid mobile number", "error");
      return;
    }
    if (email && !email.includes("@")) {
      showToast("Enter a valid email (or leave blank)", "error");
      return;
    }
    // Best-effort: flip table status to RUNNING in cashier UI once details are entered.
    publicApi.post(`/public/qr/${token}/start`).catch(() => {});
    setCustomer({ customer_name: name, mobile, email });
    setStep("MENU");
  };

  const submitOrder = async () => {
    if (submitting) return;
    if (!cartRows.length) {
      showToast("Add items to cart", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...customer,
        mobile: onlyDigits(customer.mobile),
        items: cartRows.map((r) => ({
          item_id: r.item_id,
          quantity: Number(r.quantity || 0),
        })),
      };
      const res = await publicApi.post(`/public/qr/${token}/order`, payload);
      setSentOrderId(res.data?.qr_order_id || null);
      setStep("SENT");
      setCart({});
      showToast("Order sent to cashier", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to send order", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Loading menu...
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border rounded-xl shadow p-5 max-w-md w-full">
          <div className="text-lg font-semibold text-slate-800">Menu not available</div>
          <div className="text-sm text-slate-600 mt-1">{err}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="bg-white border rounded-2xl shadow p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-extrabold truncate" style={{ color: BLUE }}>
              {shop?.shop_name || "Menu"}
            </div>
            <div className="text-xs text-slate-500">
              {branch?.branch_name ? `${branch.branch_name} • ` : ""}
              {table?.table_name ? `Table ${table.table_name}` : "Table Order"}
            </div>
          </div>
        </div>

        {step === "INFO" && (
          <div className="bg-white border rounded-2xl shadow p-4 max-w-xl">
            <div className="text-sm font-semibold text-slate-800">Customer details</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-500">Name *</label>
                <input
                  value={customer.customer_name}
                  onChange={(e) => setCustomer((c) => ({ ...c, customer_name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Your name"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-500">Mobile *</label>
                <input
                  value={customer.mobile}
                  onChange={(e) => setCustomer((c) => ({ ...c, mobile: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Mobile number"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-500">Email</label>
                <input
                  value={customer.email}
                  onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Email (optional)"
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={proceedToMenu}
                className="px-4 py-2 rounded-lg text-white text-sm"
                style={{ background: BLUE }}
              >
                Continue to Menu
              </button>
            </div>
          </div>
        )}

        {step === "SENT" && (
          <div className="bg-white border rounded-2xl shadow p-5 max-w-xl">
            <div className="text-lg font-semibold text-emerald-700">Order sent</div>
            <div className="text-sm text-slate-700 mt-1">
              {sentOrderId ? `Order #${sentOrderId} sent to cashier.` : "Order sent to cashier."}
            </div>
            <div className="text-[12px] text-slate-500 mt-2">
              If you want to add more items, place a new order.
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setStep("MENU")}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-slate-50"
              >
                Add More Items
              </button>
            </div>
          </div>
        )}

        {step === "MENU" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white border rounded-2xl shadow p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item..."
                  className="border rounded-lg px-3 py-2 text-sm flex-1"
                />
                <select
                  value={activeCat}
                  onChange={(e) => setActiveCat(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 text-sm w-full sm:w-60"
                >
                  <option value="ALL">All categories</option>
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredItems.map((it) => (
                  <div key={it.item_id} className="bg-white border rounded-2xl shadow p-3 flex gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {it.image_filename ? (
                        <img
                          alt={it.item_name}
                          src={`${API_BASE}/item-images/${it.image_filename}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-500">IMG</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">{it.item_name}</div>
                      <div className="text-xs text-slate-600 mt-0.5">₹ {Number(it.price || 0).toFixed(2)}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50"
                          onClick={() => inc(it.item_id, -1)}
                        >
                          -
                        </button>
                        <div className="w-10 text-center text-sm font-semibold">
                          {Number(cart[it.item_id] || 0)}
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50"
                          onClick={() => inc(it.item_id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="text-sm text-slate-500 p-4">No items found.</div>
                )}
              </div>
            </div>

            <div className="bg-white border rounded-2xl shadow p-4 h-fit">
              <div className="text-sm font-semibold text-slate-800">Cart</div>
              <div className="text-[12px] text-slate-500">
                {customer?.customer_name ? `For ${customer.customer_name}` : ""}
              </div>

              <div className="mt-3 space-y-2 max-h-[360px] overflow-auto">
                {cartRows.length === 0 ? (
                  <div className="text-sm text-slate-500">No items in cart.</div>
                ) : (
                  cartRows.map((r) => (
                    <div key={r.item_id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{r.item_name}</div>
                        <div className="text-[12px] text-slate-500">
                          ₹ {Number(r.price || 0).toFixed(2)} × {r.quantity}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          className="px-2 py-1 rounded border text-sm hover:bg-slate-50"
                          onClick={() => inc(r.item_id, -1)}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded border text-sm hover:bg-slate-50"
                          onClick={() => inc(r.item_id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t pt-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Total</div>
                <div className="text-sm font-extrabold text-slate-800">₹ {cartTotal.toFixed(2)}</div>
              </div>

              <button
                type="button"
                onClick={submitOrder}
                disabled={submitting}
                className="mt-3 w-full px-4 py-2 rounded-lg text-white text-sm disabled:opacity-60"
                style={{ background: BLUE }}
              >
                {submitting ? "Sending..." : "Send Order"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
