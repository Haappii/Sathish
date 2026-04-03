import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";

const publicApi = axios.create({ baseURL: API_BASE });
const BLUE = "#0B3C8C";
const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

/* ── tiny helpers ─────────────────────────────────────────────────────────── */
function fmt(n) {
  return Number(n || 0).toFixed(2);
}

/* ── Loading skeleton ─────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
      <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
      <p className="text-sm text-slate-500">Loading menu…</p>
    </div>
  );
}

/* ── Error screen ─────────────────────────────────────────────────────────── */
function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow-md p-6 max-w-sm w-full text-center space-y-3">
        <div className="text-4xl">🍽️</div>
        <div className="text-lg font-bold text-slate-800">Menu unavailable</div>
        <div className="text-sm text-slate-500">{message}</div>
      </div>
    </div>
  );
}

/* ── Customer info step ───────────────────────────────────────────────────── */
function InfoStep({ customer, setCustomer, onSubmit, locked, requiresMobile, shop, branch, table }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      {/* Hero */}
      <div className="px-5 pt-10 pb-6 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white text-2xl font-bold mb-4"
          style={{ background: BLUE }}
        >
          {String(shop?.shop_name || "M")[0].toUpperCase()}
        </div>
        <h1 className="text-2xl font-extrabold text-slate-800">
          {shop?.shop_name || "Menu"}
        </h1>
        {(branch?.branch_name || table?.table_name) && (
          <p className="text-sm text-slate-500 mt-1">
            {branch?.branch_name && <span>{branch.branch_name}</span>}
            {branch?.branch_name && table?.table_name && <span className="mx-1">·</span>}
            {table?.table_name && (
              <span className="font-semibold text-slate-700">Table {table.table_name}</span>
            )}
          </p>
        )}
      </div>

      {/* Card */}
      <div className="flex-1 px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border p-5 max-w-md mx-auto space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">Your details</h2>
            <p className="text-xs text-slate-500 mt-0.5">We'll use this to identify your order.</p>
          </div>

          {locked && requiresMobile && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Table occupied · Enter the mobile number used to open this table.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                value={customer.customer_name}
                onChange={(e) => setCustomer((c) => ({ ...c, customer_name: e.target.value }))}
                placeholder="e.g. Rahul"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Mobile <span className="text-rose-500">*</span>
              </label>
              <input
                value={customer.mobile}
                onChange={(e) => setCustomer((c) => ({ ...c, mobile: e.target.value }))}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Email <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={customer.email}
                onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                placeholder="email@example.com"
                type="email"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            className="w-full py-3 rounded-xl text-white text-sm font-bold tracking-wide"
            style={{ background: BLUE }}
          >
            View Menu →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order sent step ──────────────────────────────────────────────────────── */
function SentStep({ orderId, onAddMore, shop }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md border max-w-sm w-full p-7 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-extrabold text-slate-800">Order placed!</h2>
        {orderId && (
          <div className="inline-block bg-slate-100 rounded-xl px-4 py-1.5 text-sm font-bold text-slate-700">
            Order #{orderId}
          </div>
        )}
        <p className="text-sm text-slate-500">
          Your order has been sent to the kitchen. Sit back and relax!
        </p>
        <button
          type="button"
          onClick={onAddMore}
          className="w-full py-2.5 rounded-xl border text-sm font-semibold hover:bg-slate-50 transition"
        >
          + Add More Items
        </button>
      </div>
      {shop?.shop_name && (
        <p className="text-xs text-slate-400 mt-6">{shop.shop_name}</p>
      )}
    </div>
  );
}

/* ── Item card ────────────────────────────────────────────────────────────── */
function ItemCard({ item, qty, onInc, onDec }) {
  const inCart = qty > 0;
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-shadow ${inCart ? "shadow-md ring-1 ring-blue-200" : "shadow-sm"}`}>
      {/* image */}
      <div className="w-full h-28 bg-slate-100 overflow-hidden">
        {item.image_filename ? (
          <img
            alt={item.item_name}
            src={`${String(API_BASE).replace(/\/api\/?$/, "")}/api/item-images/${item.image_filename}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.parentElement.innerHTML =
                '<div class="w-full h-full flex items-center justify-center text-2xl">🍽️</div>';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
        )}
      </div>

      {/* info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">
          {item.item_name}
        </p>
        <p className="text-xs font-bold mt-1" style={{ color: BLUE }}>
          ₹ {fmt(item.price)}
        </p>

        {/* qty control */}
        <div className="mt-2.5 flex items-center justify-end">
          {inCart ? (
            <div className="flex items-center gap-1 bg-slate-50 rounded-xl border px-1 py-0.5">
              <button
                type="button"
                onClick={onDec}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold text-slate-600 hover:bg-white transition"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-bold text-slate-800">{qty}</span>
              <button
                type="button"
                onClick={onInc}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold text-white transition"
                style={{ background: BLUE }}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onInc}
              className="px-4 py-1.5 rounded-xl text-white text-xs font-bold transition"
              style={{ background: BLUE }}
            >
              Add +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Cart drawer (slide-up panel) ─────────────────────────────────────────── */
function CartDrawer({ cartRows, cartTotal, onInc, onDec, onSubmit, submitting, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* panel */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-800">Your Cart</h3>
          <button type="button" onClick={onClose} className="text-slate-400 text-xl leading-none">
            ✕
          </button>
        </div>

        {/* items */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">
          {cartRows.map((r) => (
            <div key={r.item_id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{r.item_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  ₹{fmt(r.price)} × {r.quantity} = <span className="font-bold text-slate-700">₹{fmt(r.price * r.quantity)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl border px-1 py-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onDec(r.item_id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold text-slate-600 hover:bg-white transition"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-bold">{r.quantity}</span>
                <button
                  type="button"
                  onClick={() => onInc(r.item_id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold text-white transition"
                  style={{ background: BLUE }}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="px-4 pt-3 pb-6 border-t space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-lg font-extrabold text-slate-800">₹ {fmt(cartTotal)}</span>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl text-white text-sm font-bold tracking-wide disabled:opacity-60 transition"
            style={{ background: BLUE }}
          >
            {submitting ? "Placing order…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function PublicQrMenu() {
  const { token } = useParams();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [requiresMobile, setRequiresMobile] = useState(false);

  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [table, setTable] = useState({});
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [step, setStep] = useState("INFO"); // INFO | MENU | SENT
  const [customer, setCustomer] = useState({ customer_name: "", mobile: "", email: "" });
  const [activeCat, setActiveCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sentOrderId, setSentOrderId] = useState(null);
  const [showCart, setShowCart] = useState(false);

  /* ── Bootstrap ── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await publicApi.get(`/public/qr/${token}/bootstrap`);
        if (!mounted) return;
        setLocked(Boolean(res.data?.locked));
        setRequiresMobile(Boolean(res.data?.requires_mobile));
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
    return () => { mounted = false; };
  }, [token]);

  /* ── Derived ── */
  const itemsById = useMemo(() => {
    const m = {};
    for (const it of items) m[it.item_id] = it;
    return m;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      const nameOk = String(i.item_name || "").toLowerCase().includes(q);
      const catOk = activeCat === "ALL" || i.category_id === activeCat;
      return nameOk && catOk;
    });
  }, [items, activeCat, search]);

  const cartRows = useMemo(() => {
    const rows = [];
    for (const [id, qty] of Object.entries(cart)) {
      const itemId = Number(id);
      const q = Number(qty || 0);
      if (!q || q <= 0) continue;
      const it = itemsById[itemId];
      if (!it) continue;
      rows.push({ ...it, quantity: q });
    }
    return rows.sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [cart, itemsById]);

  const cartTotal = useMemo(
    () => cartRows.reduce((s, r) => s + r.price * r.quantity, 0),
    [cartRows]
  );

  const cartCount = useMemo(
    () => cartRows.reduce((s, r) => s + r.quantity, 0),
    [cartRows]
  );

  /* ── Handlers ── */
  const inc = (itemId) =>
    setCart((c) => ({ ...c, [itemId]: (Number(c[itemId] || 0) + 1) }));

  const dec = (itemId) =>
    setCart((c) => {
      const next = { ...c };
      const v = Number(next[itemId] || 0) - 1;
      if (v <= 0) delete next[itemId];
      else next[itemId] = v;
      return next;
    });

  const proceedToMenu = async () => {
    const name = customer.customer_name.trim();
    const mobile = onlyDigits(customer.mobile);
    const email = customer.email.trim();

    if (!name) { showToast("Enter your name", "error"); return; }
    if (mobile.length < 8) { showToast("Enter a valid mobile number", "error"); return; }
    if (email && !email.includes("@")) { showToast("Enter a valid email or leave blank", "error"); return; }

    try {
      await publicApi.post(`/public/qr/${token}/start`, {
        customer_name: name, mobile, email: email || null,
      });
      if (locked || requiresMobile || !items.length) {
        const res = await publicApi.post(`/public/qr/${token}/bootstrap`, { mobile });
        setLocked(Boolean(res.data?.locked));
        setRequiresMobile(Boolean(res.data?.requires_mobile));
        setShop(res.data?.shop || {});
        setBranch(res.data?.branch || {});
        setTable(res.data?.table || {});
        setCategories(res.data?.categories || []);
        setItems(res.data?.items || []);
      }
      setCustomer({ customer_name: name, mobile, email });
      setStep("MENU");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Unable to open table", "error");
    }
  };

  const submitOrder = async () => {
    if (submitting) return;
    if (!cartRows.length) { showToast("Add items to cart first", "warning"); return; }
    setSubmitting(true);
    try {
      const res = await publicApi.post(`/public/qr/${token}/order`, {
        ...customer,
        mobile: onlyDigits(customer.mobile),
        items: cartRows.map((r) => ({ item_id: r.item_id, quantity: r.quantity })),
      });
      setSentOrderId(res.data?.qr_order_id || null);
      setCart({});
      setShowCart(false);
      setStep("SENT");
      showToast("Order sent to kitchen!", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to send order", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ── */
  if (loading) return <LoadingScreen />;
  if (err) return <ErrorScreen message={err} />;

  if (step === "INFO") {
    return (
      <InfoStep
        customer={customer}
        setCustomer={setCustomer}
        onSubmit={proceedToMenu}
        locked={locked}
        requiresMobile={requiresMobile}
        shop={shop}
        branch={branch}
        table={table}
      />
    );
  }

  if (step === "SENT") {
    return (
      <SentStep
        orderId={sentOrderId}
        shop={shop}
        onAddMore={() => setStep("MENU")}
      />
    );
  }

  /* ── MENU step ── */
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: BLUE }}
          >
            {String(shop?.shop_name || "M")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-slate-800 truncate">{shop?.shop_name || "Menu"}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {branch?.branch_name && <span>{branch.branch_name}</span>}
              {branch?.branch_name && table?.table_name && <span className="mx-1">·</span>}
              {table?.table_name && <span>Table {table.table_name}</span>}
            </p>
          </div>
          {customer?.customer_name && (
            <div className="flex-shrink-0 text-[11px] text-slate-500 text-right hidden sm:block">
              Hi, <span className="font-semibold text-slate-700">{customer.customer_name}</span>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="max-w-2xl mx-auto px-4 pb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Search items…"
            className="w-full bg-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="max-w-2xl mx-auto flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {[{ category_id: "ALL", category_name: "All" }, ...categories].map((cat) => {
              const active = activeCat === cat.category_id;
              return (
                <button
                  key={cat.category_id}
                  type="button"
                  onClick={() => setActiveCat(cat.category_id)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                    active
                      ? "text-white border-transparent"
                      : "text-slate-600 bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                  style={active ? { background: BLUE, borderColor: BLUE } : {}}
                >
                  {cat.category_name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Item grid ── */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-sm">No items found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredItems.map((it) => (
              <ItemCard
                key={it.item_id}
                item={it}
                qty={Number(cart[it.item_id] || 0)}
                onInc={() => inc(it.item_id)}
                onDec={() => dec(it.item_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky cart bar ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-5 pt-2 bg-gradient-to-t from-slate-100 to-transparent pointer-events-none">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="pointer-events-auto max-w-2xl mx-auto w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-white shadow-xl transition-transform active:scale-95"
            style={{ background: BLUE }}
          >
            <div className="flex items-center gap-2">
              <span className="bg-white/20 rounded-xl px-2 py-0.5 text-xs font-bold">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
              <span className="text-sm font-semibold">View Cart</span>
            </div>
            <span className="text-sm font-extrabold">₹ {fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ── Cart drawer ── */}
      {showCart && (
        <CartDrawer
          cartRows={cartRows}
          cartTotal={cartTotal}
          onInc={inc}
          onDec={dec}
          onSubmit={submitOrder}
          submitting={submitting}
          onClose={() => setShowCart(false)}
        />
      )}
    </div>
  );
}
