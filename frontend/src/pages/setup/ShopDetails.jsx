import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";

export default function ShopDetails() {

  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession();

  const userRole = session?.role || "User";
  const isSuperAdmin = userRole === "Admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
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
    billing_type: "store",
    gst_enabled: false,
    gst_percent: 0,
    gst_mode: "inclusive",

    inventory_enabled: false
  });

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

  const saveShop = async () => {
    setSaving(true);
    try {
      await authAxios.post("/shop/", form, {
        headers: { "x-user-role": userRole }
      });
      showToast("Shop updated successfully", "success");
    }
    catch (err) {
      if (err?.response?.status === 403)
        showToast("Only Super Admin can change Inventory mode", "error");
      else
        showToast("Failed to update shop details", "error");
    }
    finally {
      setSaving(false);
    }
  };

  const input =
    "w-full border rounded-xl px-3 py-2 shadow-sm bg-white focus:outline-none";

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]">
          &larr; Back
        </button>

        <h2 className="text-2xl font-bold">
          Shop Management
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* LEFT PANEL */}
        <div className="border rounded-2xl bg-white p-6 space-y-3">

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



