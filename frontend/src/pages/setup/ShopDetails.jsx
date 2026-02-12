import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import defaultLogo from "../../assets/logo.png";
import { getShopLogoUrl } from "../../utils/shopLogo";

export default function ShopDetails() {

  const navigate = useNavigate();
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

    inventory_enabled: false
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
        showToast("Only Admin can change Inventory mode", "error");
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
        <button onClick={() => navigate("/home", { replace: true })} className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]">
          &larr; Back
        </button>

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



