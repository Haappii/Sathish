/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaPlus,
  FaTable,
} from "react-icons/fa";

import api from "../../utils/apiClient";
import { API_BASE } from "../../config/api";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { getSession } from "../../utils/auth";
import { isHotelShop } from "../../utils/shopType";

const BLUE = "#0B3C8C";
const inputClass = "w-full border rounded-lg px-3 py-2 text-sm bg-white";
const webhookBase = `${String(API_BASE || "").replace(/\/api\/?$/, "")}/api/online-orders/webhook`;

export default function Branches() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";
  const shopId = session?.shop_id || "{SHOP_ID}";

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hotelShop, setHotelShop] = useState(
    () => localStorage.getItem("billing_type") === "hotel"
  );

  const emptyForm = useMemo(
    () => ({
      branch_name: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      country: "",
      pincode: "",
      type: "Branch",
      discount_enabled: false,
      discount_type: "flat",
      discount_value: 0,
      kot_required: true,
      receipt_required: true,
      swiggy_enabled: false,
      zomato_enabled: false,
      swiggy_partner_id: "",
      zomato_partner_id: "",
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
      zomato_status_sync_secret: "",
    }),
    []
  );

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const editBranch = useCallback(
    (branch) => {
      setEditingId(branch.branch_id);
      setForm({
        ...emptyForm,
        ...branch,
        discount_enabled: Boolean(branch?.discount_enabled),
        discount_type: (branch?.discount_type || "flat").toLowerCase(),
        discount_value: Number(branch?.discount_value || 0),
        kot_required: branch?.kot_required !== false,
        receipt_required: branch?.receipt_required !== false,
        swiggy_enabled: Boolean(branch?.swiggy_enabled),
        zomato_enabled: Boolean(branch?.zomato_enabled),
        online_orders_auto_accept: Boolean(branch?.online_orders_auto_accept),
        online_orders_signature_required: Boolean(branch?.online_orders_signature_required),
        online_orders_status_sync_enabled:
          branch?.online_orders_status_sync_enabled !== false,
        online_orders_status_sync_strict: Boolean(branch?.online_orders_status_sync_strict),
        online_orders_status_sync_timeout_sec:
          Number(branch?.online_orders_status_sync_timeout_sec) || 8,
      });
    },
    [emptyForm]
  );

  const loadBranches = useCallback(async () => {
    try {
      const res = await api.get("/branch/scoped");
      const rows = res.data || [];
      setBranches(rows);

      if (!isAdmin) {
        const first = rows?.[0] || null;
        if (first?.branch_id) editBranch(first);
      }
    } catch (err) {
      setBranches([]);
      const msg = err?.response?.data?.detail || "Failed to load branches";
      showToast(msg, "error");
    }
  }, [editBranch, isAdmin, showToast]);

  useEffect(() => {
    loadBranches();
    api
      .get("/shop/details")
      .then((res) => {
        const data = res.data || {};
        // Also persist so other pages can read without re-fetching
        if (data.billing_type) {
          localStorage.setItem("billing_type", data.billing_type.toLowerCase());
        }
        setHotelShop(isHotelShop(data));
      })
      .catch(() => {
        // Fall back to the value MainLayout already cached in localStorage
        const cached = localStorage.getItem("billing_type");
        setHotelShop(cached === "hotel");
      });
  }, [loadBranches]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveBranch = async () => {
    if (!isAdmin && !editingId) {
      showToast("Only Admin can create branches", "error");
      return;
    }
    if (!form.branch_name || !form.city || !form.country) {
      showToast("Branch Name, City & Country are required", "error");
      return;
    }

    if (form.discount_enabled) {
      const discountType = String(form.discount_type || "flat").toLowerCase();
      const discountValue = Number(form.discount_value || 0);
      if (!discountValue || discountValue < 0) {
        showToast("Enter valid discount value", "error");
        return;
      }
      if (discountType === "percent" && discountValue > 100) {
        showToast("Percent discount cannot exceed 100", "error");
        return;
      }
    }

    const timeout = Number(form.online_orders_status_sync_timeout_sec || 8);
    if (Number.isNaN(timeout) || timeout < 3 || timeout > 30) {
      showToast("Status sync timeout must be between 3 and 30 seconds", "error");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value || 0),
        online_orders_status_sync_timeout_sec: timeout,
      };

      if (editingId) {
        await api.put(`/branch/${editingId}`, payload);
        showToast("Branch updated", "success");
      } else {
        await api.post("/branch/create", payload);
        showToast("Branch created", "success");
      }

      setForm(emptyForm);
      setEditingId(null);
      await loadBranches();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Save failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id, status) => {
    if (!isAdmin) {
      showToast("Only Admin can change branch status", "error");
      return;
    }
    try {
      await api.post(`/branch/${id}/status?status=${status}`);
      await loadBranches();
    } catch {
      showToast("Status update failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <h2 className="text-2xl font-extrabold" style={{ color: BLUE }}>
          Branch Management
        </h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr,0.75fr] gap-6">
        <div className="bg-white p-6 rounded-2xl shadow space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">
                {editingId ? "Edit Branch" : "Create Branch"}
              </h3>
              <div className="text-xs text-slate-500">
                Online order settings are now saved branchwise.
              </div>
            </div>
            {!isAdmin && editingId ? (
              <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-50 text-slate-600">
                Your Branch
              </span>
            ) : null}
          </div>

          <SectionCard title="Branch Details">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Branch Name *">
                <input
                  className={inputClass}
                  value={form.branch_name}
                  onChange={(e) => setField("branch_name", e.target.value)}
                />
              </Field>
              <Field label="Branch Type">
                <select
                  className={inputClass}
                  disabled
                  value={form.type}
                  onChange={(e) => setField("type", e.target.value)}
                >
                  <option value="Branch">Branch</option>
                  <option value="Head Office">Head Office</option>
                </select>
              </Field>
              <Field label="Address Line 1">
                <input
                  className={inputClass}
                  value={form.address_line1 || ""}
                  onChange={(e) => setField("address_line1", e.target.value)}
                />
              </Field>
              <Field label="Address Line 2">
                <input
                  className={inputClass}
                  value={form.address_line2 || ""}
                  onChange={(e) => setField("address_line2", e.target.value)}
                />
              </Field>
              <Field label="City *">
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </Field>
              <Field label="State">
                <input
                  className={inputClass}
                  value={form.state || ""}
                  onChange={(e) => setField("state", e.target.value)}
                />
              </Field>
              <Field label="Country *">
                <input
                  className={inputClass}
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                />
              </Field>
              <Field label="Pincode">
                <input
                  className={inputClass}
                  value={form.pincode || ""}
                  onChange={(e) => setField("pincode", e.target.value)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Default Discount">
            <ToggleRow
              label="Enable default discount"
              hint="Applied automatically for this branch when supported."
              checked={Boolean(form.discount_enabled)}
              onChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  discount_enabled: checked,
                  discount_type: prev.discount_type || "flat",
                  discount_value: prev.discount_value ?? 0,
                }))
              }
            />

            {form.discount_enabled ? (
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Discount Type">
                  <select
                    className={inputClass}
                    value={String(form.discount_type || "flat").toLowerCase()}
                    onChange={(e) => setField("discount_type", e.target.value)}
                  >
                    <option value="flat">Flat</option>
                    <option value="percent">Percent %</option>
                  </select>
                </Field>
                <Field label="Discount Value">
                  <input
                    type="number"
                    className={inputClass}
                    value={form.discount_value}
                    onChange={(e) => setField("discount_value", e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Printing">
            <div className="grid md:grid-cols-2 gap-3">
              <ToggleRow
                label="KOT required"
                hint="Print kitchen tickets for this branch."
                checked={Boolean(form.kot_required)}
                onChange={(checked) => setField("kot_required", checked)}
              />
              <ToggleRow
                label="Receipt required"
                hint="Print customer receipts by default."
                checked={Boolean(form.receipt_required)}
                onChange={(checked) => setField("receipt_required", checked)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Online Orders">
            <div className="rounded-xl border bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Webhook endpoint for this shop:
              <div className="mt-1 font-mono break-all text-slate-700">
                {webhookBase}/{"{PROVIDER}"}/{shopId}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <ToggleRow
                label="Auto accept orders"
                hint="Accept new online orders automatically for this branch."
                checked={Boolean(form.online_orders_auto_accept)}
                onChange={(checked) => setField("online_orders_auto_accept", checked)}
              />
              <ToggleRow
                label="Require webhook signature"
                hint="Reject unsigned webhooks unless branch secrets are configured."
                checked={Boolean(form.online_orders_signature_required)}
                onChange={(checked) => setField("online_orders_signature_required", checked)}
              />
              <ToggleRow
                label="Enable status sync"
                hint="Send order status updates back to the provider."
                checked={Boolean(form.online_orders_status_sync_enabled)}
                onChange={(checked) => setField("online_orders_status_sync_enabled", checked)}
              />
              <ToggleRow
                label="Strict sync mode"
                hint="Fail the action if the provider status sync call fails."
                checked={Boolean(form.online_orders_status_sync_strict)}
                onChange={(checked) => setField("online_orders_status_sync_strict", checked)}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Fallback Webhook Token">
                <input
                  className={inputClass}
                  value={form.online_orders_webhook_token || ""}
                  onChange={(e) => setField("online_orders_webhook_token", e.target.value)}
                />
              </Field>
              <Field label="Status Sync Timeout (sec)">
                <input
                  type="number"
                  min="3"
                  max="30"
                  className={inputClass}
                  value={form.online_orders_status_sync_timeout_sec || 8}
                  onChange={(e) =>
                    setField("online_orders_status_sync_timeout_sec", e.target.value)
                  }
                />
              </Field>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <ProviderCard
                title="Swiggy"
                enabled={Boolean(form.swiggy_enabled)}
                onToggle={(checked) => setField("swiggy_enabled", checked)}
              >
                <Field label="Swiggy Partner ID">
                  <input
                    className={inputClass}
                    value={form.swiggy_partner_id || ""}
                    onChange={(e) => setField("swiggy_partner_id", e.target.value)}
                  />
                </Field>
                <SecretField
                  label="Swiggy Webhook Secret"
                  value={form.swiggy_webhook_secret || ""}
                  onChange={(e) => setField("swiggy_webhook_secret", e.target.value)}
                />
                <Field label="Swiggy Status Sync URL">
                  <input
                    className={inputClass}
                    value={form.swiggy_status_sync_url || ""}
                    onChange={(e) => setField("swiggy_status_sync_url", e.target.value)}
                  />
                </Field>
                <SecretField
                  label="Swiggy Status Sync Token"
                  value={form.swiggy_status_sync_token || ""}
                  onChange={(e) => setField("swiggy_status_sync_token", e.target.value)}
                />
                <SecretField
                  label="Swiggy Status Sync Secret"
                  value={form.swiggy_status_sync_secret || ""}
                  onChange={(e) => setField("swiggy_status_sync_secret", e.target.value)}
                />
              </ProviderCard>

              <ProviderCard
                title="Zomato"
                enabled={Boolean(form.zomato_enabled)}
                onToggle={(checked) => setField("zomato_enabled", checked)}
              >
                <Field label="Zomato Partner ID">
                  <input
                    className={inputClass}
                    value={form.zomato_partner_id || ""}
                    onChange={(e) => setField("zomato_partner_id", e.target.value)}
                  />
                </Field>
                <SecretField
                  label="Zomato Webhook Secret"
                  value={form.zomato_webhook_secret || ""}
                  onChange={(e) => setField("zomato_webhook_secret", e.target.value)}
                />
                <Field label="Zomato Status Sync URL">
                  <input
                    className={inputClass}
                    value={form.zomato_status_sync_url || ""}
                    onChange={(e) => setField("zomato_status_sync_url", e.target.value)}
                  />
                </Field>
                <SecretField
                  label="Zomato Status Sync Token"
                  value={form.zomato_status_sync_token || ""}
                  onChange={(e) => setField("zomato_status_sync_token", e.target.value)}
                />
                <SecretField
                  label="Zomato Status Sync Secret"
                  value={form.zomato_status_sync_secret || ""}
                  onChange={(e) => setField("zomato_status_sync_secret", e.target.value)}
                />
              </ProviderCard>
            </div>
          </SectionCard>

          <button
            onClick={saveBranch}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-white flex items-center gap-2"
            style={{ background: BLUE }}
          >
            {editingId ? <FaEdit /> : <FaPlus />}
            {editingId ? "Update" : "Create"}
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow space-y-3">
          <h3 className="font-semibold text-slate-800">Branch List</h3>

          <table className="w-full text-sm">
            <thead className="bg-blue-50">
              <tr>
                <th className="p-2 text-left">Branch</th>
                <th className="p-2 text-left">City</th>
                <th className="p-2 text-left">Online Orders</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.branch_id} className="border-b align-top">
                  <td className="p-2 font-semibold">{branch.branch_name}</td>
                  <td className="p-2">{branch.city || "-"}</td>
                  <td className="p-2">
                    <div className="text-[11px] text-slate-600">
                      Swiggy: {branch.swiggy_enabled ? "On" : "Off"}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Zomato: {branch.zomato_enabled ? "On" : "Off"}
                    </div>
                  </td>
                  <td className="p-2 text-center">{branch.status}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => editBranch(branch)}
                        className="px-3 py-1 border rounded-full"
                      >
                        Edit
                      </button>
                      {hotelShop ? (
                        <button
                          onClick={() => navigate(`/setup/branches/${branch.branch_id}/tables`)}
                          className="px-3 py-1 border rounded-full flex items-center gap-1"
                        >
                          <FaTable size={12} /> Tables
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          toggleStatus(
                            branch.branch_id,
                            branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                          )
                        }
                        className="px-3 py-1 border rounded-full"
                        disabled={!isAdmin}
                      >
                        {branch.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!branches.length ? (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-gray-400">
                    No branches found
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="rounded-2xl border bg-slate-50/70 p-4 space-y-4">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="rounded-xl border bg-white px-3 py-2 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint ? <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div> : null}
      </div>
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function ProviderCard({ title, enabled, onToggle, children }) {
  return (
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <ToggleRow
        label={`${title} integration`}
        hint={`Configure ${title} for this branch.`}
        checked={enabled}
        onChange={onToggle}
      />
      {enabled ? <div className="space-y-3">{children}</div> : null}
    </div>
  );
}

function SecretField({ label, value, onChange }) {
  const [show, setShow] = useState(false);

  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className={`${inputClass} pr-16`}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-blue-700"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}
