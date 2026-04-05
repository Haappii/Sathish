import { useEffect, useRef, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import defaultLogo from "../../assets/logo.png";
import { getShopLogoUrl } from "../../utils/shopLogo";
import BackButton from "../../components/BackButton";

const ONLINE_ORDER_FIELDS = [
  "swiggy_partner_id","zomato_partner_id","swiggy_enabled","zomato_enabled",
  "online_orders_auto_accept","online_orders_webhook_token","online_orders_signature_required",
  "swiggy_webhook_secret","zomato_webhook_secret","online_orders_status_sync_enabled",
  "online_orders_status_sync_strict","online_orders_status_sync_timeout_sec",
  "swiggy_status_sync_url","zomato_status_sync_url","swiggy_status_sync_token",
  "zomato_status_sync_token","swiggy_status_sync_secret","zomato_status_sync_secret",
];

export default function ShopDetails() {
  const { showToast } = useToast();
  const session = getSession();
  const fileRef = useRef();

  const userRole = session?.role || "User";
  const isSuperAdmin = userRole === "Admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    shop_id: "", shop_name: "", owner_name: "", mobile: "", mailid: "",
    address_line1: "", address_line2: "", address_line3: "",
    city: "", state: "", pincode: "",
    gst_number: "", logo_url: "", billing_type: "store",
    gst_enabled: false, gst_percent: 0, gst_mode: "inclusive",
    inventory_enabled: false, inventory_cost_method: "LAST",
    items_branch_wise: false,
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (!logoFile) { setLogoPreviewUrl(""); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    let mounted = true;
    authAxios.get("/shop/details")
      .then(res => { if (mounted && res?.data) setForm(f => ({ ...f, ...res.data })); })
      .catch(() => showToast("Failed to load shop details", "error"))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) { setLogoFile(null); return; }
    const ok = file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/i.test(file.name);
    if (!ok) { showToast("Logo must be PNG or JPG", "error"); e.target.value = ""; return; }
    setLogoFile(file);
  };

  const saveShop = async () => {
    setSaving(true);
    const wantsLogo = !!logoFile;
    const uploadLogo = async () => {
      if (!logoFile) return { ok: true };
      const fd = new FormData();
      fd.append("file", logoFile);
      try {
        const res = await authAxios.post("/shop/logo", fd);
        const logoUrl = res?.data?.logo_url;
        if (logoUrl) setForm(prev => ({ ...prev, logo_url: logoUrl }));
        setLogoFile(null);
        return { ok: true };
      } catch (err) {
        return { ok: false, msg: err?.response?.data?.detail || "Logo upload failed" };
      }
    };
    try {
      const payload = { ...form };
      delete payload.billing_type;
      ONLINE_ORDER_FIELDS.forEach(k => delete payload[k]);
      await authAxios.post("/shop/", payload, { headers: { "x-user-role": userRole } });
      const logoRes = await uploadLogo();
      if (!logoRes.ok) showToast(`Saved, but logo failed: ${logoRes.msg}`, "warning");
      else showToast(wantsLogo ? "Shop updated (logo uploaded)" : "Shop updated", "success");
    } catch (err) {
      showToast(err?.response?.status === 403 ? "Only Admin can change these settings" : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const currentLogoSrc =
    logoPreviewUrl ||
    getShopLogoUrl({ shop_id: form.shop_id || session?.shop_id, shop_name: form.shop_name, logo_url: form.logo_url }) ||
    defaultLogo;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      </div>
    );
  }

  const billingLabel = String(form.billing_type || "").toLowerCase() === "hotel"
    ? "Hotel / Restaurant" : "Store / Retail";

  return (
    <div className="space-y-5 pb-10">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Shop Details</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage branding, address, GST and inventory</p>
          </div>
        </div>
        <button
          onClick={saveShop}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-200 transition"
        >
          {saving
            ? <><Spinner /> Saving…</>
            : <><CheckIcon /> Save Changes</>}
        </button>
      </div>

      {/* ── Quick-status row ── */}
      <div className="grid grid-cols-3 gap-3">
        <QuickBadge emoji="🏪" label="Business" value={billingLabel} />
        <QuickBadge
          emoji="🧾" label="GST"
          value={form.gst_enabled ? `Enabled · ${form.gst_percent || 0}%` : "Disabled"}
          active={form.gst_enabled}
        />
        <QuickBadge
          emoji="📦" label="Inventory"
          value={form.inventory_enabled ? `On · ${String(form.inventory_cost_method || "LAST").toUpperCase()}` : "Off"}
          active={form.inventory_enabled}
        />
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid xl:grid-cols-[1fr_380px] gap-5">

        {/* Left column */}
        <div className="space-y-5">

          {/* Identity card */}
          <Card title="Identity" subtitle="Brand & contact info">
            {/* Logo row */}
            <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <div
                className="relative group cursor-pointer w-20 h-20 rounded-xl border border-gray-200 bg-white overflow-hidden shrink-0 shadow-sm"
                onClick={() => fileRef.current?.click()}
              >
                <img
                  src={currentLogoSrc}
                  alt="Logo"
                  className="w-full h-full object-cover"
                  onError={e => { e.currentTarget.src = defaultLogo; }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-[11px] font-semibold">Change</span>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoChange} />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-700">Shop Logo</p>
                <p className="text-xs text-gray-400">Click image to upload · PNG or JPG</p>
                {logoFile && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    ✓ {logoFile.name}
                  </span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Shop Name *">
                <Input value={form.shop_name} onChange={e => setField("shop_name", e.target.value)} placeholder="e.g. Sharma General Store" />
              </Field>
              <Field label="Owner Name">
                <Input value={form.owner_name} onChange={e => setField("owner_name", e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Mobile">
                <Input value={form.mobile} onChange={e => setField("mobile", e.target.value)} placeholder="+91 XXXXX XXXXX" />
              </Field>
              <Field label="Email">
                <Input value={form.mailid} onChange={e => setField("mailid", e.target.value)} placeholder="shop@example.com" />
              </Field>
            </div>

            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              <span>ℹ️</span>
              <span>Business type: <strong>{billingLabel}</strong> — set at registration, cannot be changed.</span>
            </div>
          </Card>

          {/* Address card */}
          <Card title="Address" subtitle="Prints on invoices & receipts">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Address Line 1">
                <Input value={form.address_line1} onChange={e => setField("address_line1", e.target.value)} placeholder="Door / Flat, Building" />
              </Field>
              <Field label="Address Line 2">
                <Input value={form.address_line2} onChange={e => setField("address_line2", e.target.value)} placeholder="Street / Road" />
              </Field>
              <Field label="Address Line 3">
                <Input value={form.address_line3} onChange={e => setField("address_line3", e.target.value)} placeholder="Area / Locality" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={e => setField("city", e.target.value)} placeholder="City" />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={e => setField("state", e.target.value)} placeholder="State" />
              </Field>
              <Field label="Pincode">
                <Input value={form.pincode} onChange={e => setField("pincode", e.target.value)} placeholder="6-digit pin" />
              </Field>
            </div>
          </Card>

        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* GST card */}
          <Card title="GST & Taxes" subtitle="Fiscal settings">
            <Toggle
              label="Enable GST"
              hint="Applies GST to all invoices"
              checked={form.gst_enabled}
              onChange={v => setField("gst_enabled", v)}
            />

            {form.gst_enabled && (
              <div className="space-y-3 pt-1">
                <Field label="GST Number">
                  <Input value={form.gst_number} onChange={e => setField("gst_number", e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="GST %">
                    <Input type="number" value={form.gst_percent} onChange={e => setField("gst_percent", e.target.value)} placeholder="18" />
                  </Field>
                  <Field label="Mode">
                    <Select value={form.gst_mode} onChange={e => setField("gst_mode", e.target.value)}>
                      <option value="inclusive">Inclusive</option>
                      <option value="exclusive">Exclusive</option>
                    </Select>
                  </Field>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <strong>Inclusive</strong> — price already contains GST.&nbsp;
                  <strong>Exclusive</strong> — GST added on top at billing.
                </p>
              </div>
            )}
          </Card>

          {/* Inventory card */}
          <Card title="Inventory" subtitle="Stock tracking settings">
            {!isSuperAdmin && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <span>⚠️</span> Only Admin can change inventory settings.
              </div>
            )}

            <Toggle
              label="Enable Inventory"
              hint="Track stock levels & purchase orders"
              checked={form.inventory_enabled}
              onChange={v => setField("inventory_enabled", v)}
              disabled={!isSuperAdmin}
            />

            <Toggle
              label="Branch-wise Items"
              hint="Each branch manages its own items and prices independently. When OFF, all branches share head-office items."
              checked={form.items_branch_wise}
              onChange={v => setField("items_branch_wise", v)}
              disabled={!isSuperAdmin}
            />

            {form.inventory_enabled && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-gray-600">Cost Method</p>
                <div className="space-y-2">
                  {[
                    { k: "LAST", title: "Last Cost", desc: "Uses latest PO price. Simple & fast." },
                    { k: "WAVG", title: "Weighted Avg", desc: "Running average of all purchases." },
                    { k: "FIFO",  title: "FIFO", desc: "First-in-first-out via Item Lots." },
                  ].map(c => (
                    <div
                      key={c.k}
                      onClick={() => isSuperAdmin && setField("inventory_cost_method", c.k)}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition
                        ${String(form.inventory_cost_method || "LAST").toUpperCase() === c.k
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"}
                        ${!isSuperAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                        String(form.inventory_cost_method || "LAST").toUpperCase() === c.k
                          ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`} />
                      <div>
                        <div className="text-xs font-semibold text-gray-700">{c.title}</div>
                        <div className="text-[11px] text-gray-400">{c.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

/* ── Reusable components ── */

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-gray-300 transition disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:bg-gray-50 disabled:text-gray-400"
    >
      {children}
    </select>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 cursor-pointer transition
      ${checked ? "border-blue-200 bg-blue-50/60" : "border-gray-200 bg-gray-50/60"}
      ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-gray-300"}`}
    >
      <div>
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
      </div>
      <div className="relative shrink-0 mt-0.5" onClick={e => e.preventDefault()}>
        <input
          type="checkbox" className="sr-only"
          checked={checked} disabled={disabled}
          onChange={e => !disabled && onChange(e.target.checked)}
        />
        <div
          className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}
          onClick={() => !disabled && onChange(!checked)}
        />
        <div className={`pointer-events-none absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </div>
    </label>
  );
}

function QuickBadge({ emoji, label, value, active }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? "bg-blue-50 border-blue-100" : "bg-white border-gray-100"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span>{emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      </div>
      <div className={`text-sm font-bold ${active ? "text-blue-700" : "text-gray-600"}`}>{value}</div>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />;
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
