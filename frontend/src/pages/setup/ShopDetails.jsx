import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import defaultLogo from "../../assets/logo.png";
import { getShopLogoUrl } from "../../utils/shopLogo";
import BackButton from "../../components/BackButton";

export default function ShopDetails() {
  const { showToast } = useToast();
  const session = getSession();

  const userRole = session?.role || "User";
  const isSuperAdmin = userRole === "Admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    shop_id: "",
    shop_name: "",
    owner_name: "",
    mobile: "",
    mailid: "",

    address_line1: "",
    address_line2: "",
    address_line3: "",
    city: "",
    state: "",
    pincode: "",

    gst_number: "",
    logo_url: "",
    billing_type: "store",
    gst_enabled: false,
    gst_percent: 0,
    gst_mode: "inclusive",

    inventory_enabled: false,
    inventory_cost_method: "LAST",
    swiggy_partner_id: "",
    zomato_partner_id: "",
    swiggy_enabled: false,
    zomato_enabled: false,
    online_orders_auto_accept: false,
    online_orders_webhook_token: "",
    online_orders_signature_required: false,
    swiggy_webhook_secret: "",
    zomato_webhook_secret: "",
    online_orders_status_sync_enabled: true,
    online_orders_status_sync_strict: false,
    online_orders_status_sync_timeout_sec: 8,
    swiggy_status_sync_url: "",
    zomato_status_sync_url: "",
    swiggy_status_sync_token: "",
    zomato_status_sync_token: "",
    swiggy_status_sync_secret: "",
    zomato_status_sync_secret: ""
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    let mounted = true;

    authAxios.get("/shop/details")
      .then(res => {
        if (!mounted || !res?.data) return;
        setForm(f => ({ ...f, ...res.data }));   // merge only → no jump
      })
      .catch(() => showToast("Failed to load shop details", "error"))
      .finally(() => setLoading(false));

    return () => mounted = false;
  }, []);

  const setField = (key, value) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLogoFile(null);
      return;
    }

    const okType =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      /\.(png|jpe?g)$/i.test(file.name || "");

    if (!okType) {
      showToast("Logo must be PNG or JPG/JPEG", "error");
      e.target.value = "";
      setLogoFile(null);
      return;
    }

    setLogoFile(file);
  };

  const saveShop = async () => {
    setSaving(true);
    const wantsLogoUpload = !!logoFile;

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
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Logo upload failed";
        return { ok: false, msg };
      }
    };

    try {
      await authAxios.post("/shop/", form, {
        headers: { "x-user-role": userRole }
      });

      const logoRes = await uploadLogo();
      if (!logoRes.ok) {
        showToast(`Shop updated, but logo upload failed: ${logoRes.msg}`, "warning");
      } else {
        showToast(
          wantsLogoUpload ? "Shop updated (logo uploaded)" : "Shop updated successfully",
          "success"
        );
      }
    } catch (err) {
      if (err?.response?.status === 403)
        showToast("Only Admin can change protected settings", "error");
      else
        showToast("Failed to update shop details", "error");
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full border rounded-xl px-3 py-2 shadow-sm bg-white focus:outline-none";

  const currentLogoSrc =
    logoPreviewUrl ||
    getShopLogoUrl({
      shop_id: form.shop_id || session?.shop_id,
      shop_name: form.shop_name,
      logo_url: form.logo_url
    }) ||
    defaultLogo;

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-3">
        <BackButton />

        <h2 className="text-2xl font-bold">
          Shop Management
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* LEFT PANEL */}
        <div className="border rounded-2xl bg-white p-6 space-y-3">

          <Field label="Shop Logo">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border bg-gray-50 overflow-hidden flex items-center justify-center">
                <img
                  src={currentLogoSrc}
                  alt="Shop Logo"
                  className="w-full h-full object-cover"
                  onError={e => { e.currentTarget.src = defaultLogo; }}
                />
              </div>

              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className={input}
                  onChange={handleLogoChange}
                />
                <div className="text-[11px] text-gray-500 mt-1">
                  PNG / JPG / JPEG
                </div>
              </div>
            </div>
          </Field>

          <Field label="Shop Name">
            <input
              className={input}
              value={form.shop_name}
              onChange={e => setField("shop_name", e.target.value)}
            />
          </Field>

          <Field label="Owner Name">
            <input
              className={input}
              value={form.owner_name}
              onChange={e => setField("owner_name", e.target.value)}
            />
          </Field>

          <Field label="Mobile Number">
            <input
              className={input}
              value={form.mobile}
              onChange={e => setField("mobile", e.target.value)}
            />
          </Field>

          <Field label="Email ID">
            <input
              className={input}
              value={form.mailid}
              onChange={e => setField("mailid", e.target.value)}
            />
          </Field>

          {/* Business Type */}
          <Field label="Business Type">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={form.billing_type === "store"}
                  onChange={() => setField("billing_type", "store")}
                />
                Store / Retail
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={form.billing_type === "hotel"}
                  onChange={() => setField("billing_type", "hotel")}
                />
                Hotel / Restaurant
              </label>
            </div>
          </Field>

        </div>

        {/* RIGHT PANEL */}
        <div className="border rounded-2xl bg-white p-6 space-y-3">

          <Field label="Address Line 1">
            <input
              className={input}
              value={form.address_line1}
              onChange={e => setField("address_line1", e.target.value)}
            />
          </Field>

          <Field label="Address Line 2">
            <input
              className={input}
              value={form.address_line2}
              onChange={e => setField("address_line2", e.target.value)}
            />
          </Field>

          <Field label="Address Line 3">
            <input
              className={input}
              value={form.address_line3}
              onChange={e => setField("address_line3", e.target.value)}
            />
          </Field>

          <Field label="City">
            <input
              className={input}
              value={form.city}
              onChange={e => setField("city", e.target.value)}
            />
          </Field>

          <Field label="State">
            <input
              className={input}
              value={form.state}
              onChange={e => setField("state", e.target.value)}
            />
          </Field>

          <Field label="Pincode">
            <input
              className={input}
              value={form.pincode}
              onChange={e => setField("pincode", e.target.value)}
            />
          </Field>

          {/* GST Section */}
          <Field label="GST Enabled">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.gst_enabled}
                onChange={e => setField("gst_enabled", e.target.checked)}
              />
              Enable GST
            </label>
          </Field>

          {form.gst_enabled && (
            <>
              <Field label="GST Number">
                <input
                  className={input}
                  value={form.gst_number}
                  onChange={e => setField("gst_number", e.target.value)}
                />
              </Field>

              <Field label="GST %">
                <input
                  type="number"
                  className={input}
                  value={form.gst_percent}
                  onChange={e => setField("gst_percent", e.target.value)}
                />
              </Field>

              <Field label="GST Mode">
                <select
                  className={input}
                  value={form.gst_mode}
                  onChange={e => setField("gst_mode", e.target.value)}
                >
                  <option value="inclusive">Price Includes GST</option>
                  <option value="exclusive">Add GST on Top</option>
                </select>
              </Field>
            </>
          )}

          {/* Inventory Mode */}
          <Field label="Inventory Mode">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.inventory_enabled ? "YES" : "NO"}
              onChange={e => setField("inventory_enabled", e.target.value === "YES")}
            >
              <option value="NO">Disabled</option>
              <option value="YES">Enabled</option>
            </select>
          </Field>

          <Field label="Inventory Cost Method">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={String(form.inventory_cost_method || "LAST").toUpperCase()}
              onChange={e => setField("inventory_cost_method", e.target.value)}
            >
              <option value="LAST">Last Purchase Cost</option>
              <option value="WAVG">Weighted Average Cost</option>
            </select>
            <div className="text-[11px] text-gray-500 mt-1">
              Used to update item buy price on PO receive (affects future profit).
            </div>
          </Field>

          <Field label="Swiggy Partner ID">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_partner_id || ""}
              onChange={e => setField("swiggy_partner_id", e.target.value)}
            />
          </Field>

          <Field label="Zomato Partner ID">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_partner_id || ""}
              onChange={e => setField("zomato_partner_id", e.target.value)}
            />
          </Field>

          <Field label="Swiggy Integration">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_enabled ? "YES" : "NO"}
              onChange={e => setField("swiggy_enabled", e.target.value === "YES")}
            >
              <option value="NO">Disabled</option>
              <option value="YES">Enabled</option>
            </select>
          </Field>

          <Field label="Zomato Integration">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_enabled ? "YES" : "NO"}
              onChange={e => setField("zomato_enabled", e.target.value === "YES")}
            >
              <option value="NO">Disabled</option>
              <option value="YES">Enabled</option>
            </select>
          </Field>

          <Field label="Auto Accept Online Orders">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.online_orders_auto_accept ? "YES" : "NO"}
              onChange={e => setField("online_orders_auto_accept", e.target.value === "YES")}
            >
              <option value="NO">Disabled</option>
              <option value="YES">Enabled</option>
            </select>
          </Field>

          <Field label="Webhook Token">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.online_orders_webhook_token || ""}
              onChange={e => setField("online_orders_webhook_token", e.target.value)}
            />
          </Field>

          <Field label="Require HMAC Signature">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.online_orders_signature_required ? "YES" : "NO"}
              onChange={e => setField("online_orders_signature_required", e.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </Field>

          <Field label="Swiggy Webhook Secret">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_webhook_secret || ""}
              onChange={e => setField("swiggy_webhook_secret", e.target.value)}
            />
          </Field>

          <Field label="Zomato Webhook Secret">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_webhook_secret || ""}
              onChange={e => setField("zomato_webhook_secret", e.target.value)}
            />
          </Field>

          <Field label="Status Sync Enabled">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.online_orders_status_sync_enabled ? "YES" : "NO"}
              onChange={e => setField("online_orders_status_sync_enabled", e.target.value === "YES")}
            >
              <option value="YES">Enabled</option>
              <option value="NO">Disabled</option>
            </select>
          </Field>

          <Field label="Status Sync Strict Mode">
            <select
              disabled={!isSuperAdmin}
              className={input}
              value={form.online_orders_status_sync_strict ? "YES" : "NO"}
              onChange={e => setField("online_orders_status_sync_strict", e.target.value === "YES")}
            >
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
          </Field>

          <Field label="Status Sync Timeout (sec)">
            <input
              disabled={!isSuperAdmin}
              type="number"
              min="3"
              max="30"
              className={input}
              value={form.online_orders_status_sync_timeout_sec || 8}
              onChange={e => setField("online_orders_status_sync_timeout_sec", Number(e.target.value || 8))}
            />
          </Field>

          <Field label="Swiggy Status Sync URL">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_status_sync_url || ""}
              onChange={e => setField("swiggy_status_sync_url", e.target.value)}
            />
          </Field>

          <Field label="Swiggy Status Sync Token">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_status_sync_token || ""}
              onChange={e => setField("swiggy_status_sync_token", e.target.value)}
            />
          </Field>

          <Field label="Swiggy Status Sync Secret">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.swiggy_status_sync_secret || ""}
              onChange={e => setField("swiggy_status_sync_secret", e.target.value)}
            />
          </Field>

          <Field label="Zomato Status Sync URL">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_status_sync_url || ""}
              onChange={e => setField("zomato_status_sync_url", e.target.value)}
            />
          </Field>

          <Field label="Zomato Status Sync Token">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_status_sync_token || ""}
              onChange={e => setField("zomato_status_sync_token", e.target.value)}
            />
          </Field>

          <Field label="Zomato Status Sync Secret">
            <input
              disabled={!isSuperAdmin}
              className={input}
              value={form.zomato_status_sync_secret || ""}
              onChange={e => setField("zomato_status_sync_secret", e.target.value)}
            />
          </Field>

          <button
            onClick={saveShop}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 text-white"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      {children}
    </div>
  );
}



