/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaPlus,
  FaTable,
  FaStore,
  FaCheckCircle,
  FaTimesCircle,
  FaMotorcycle,
  FaUtensils,
} from "react-icons/fa";
import { MdLocationOn, MdBusiness } from "react-icons/md";

import api from "../../utils/apiClient";
import { API_BASE } from "../../config/api";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { getSession } from "../../utils/auth";
import { isHotelShop } from "../../utils/shopType";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";
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
      loyalty_points_percentage: 0,
      kot_required: true,
      receipt_required: true,
      feedback_qr_enabled: true,
      print_logo_enabled: true,
      order_live_tracking_enabled: true,
      paper_size: "58mm",
      fssai_number: "",
      service_charge_required: false,
      service_charge_amount: 0,
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
      const rawServiceChargeRequired = branch?.service_charge_required;
      const rawServiceChargeAmount = Number(branch?.service_charge_amount || 0);
      const normalizedServiceChargeRequired =
        typeof rawServiceChargeRequired === "boolean"
          ? rawServiceChargeRequired
          : rawServiceChargeAmount > 0;
      setEditingId(branch.branch_id);
      setForm({
        ...emptyForm,
        ...branch,
        discount_enabled: Boolean(branch?.discount_enabled),
        discount_type: (branch?.discount_type || "flat").toLowerCase(),
        discount_value: Number(branch?.discount_value || 0),
        kot_required: branch?.kot_required !== false,
        receipt_required: branch?.receipt_required !== false,
        feedback_qr_enabled: branch?.feedback_qr_enabled !== false,
        print_logo_enabled: branch?.print_logo_enabled !== false,
        order_live_tracking_enabled: branch?.order_live_tracking_enabled !== false,
        paper_size: branch?.paper_size || "58mm",
        fssai_number: branch?.fssai_number || "",
        service_charge_required: normalizedServiceChargeRequired,
        service_charge_amount: rawServiceChargeAmount,
        loyalty_points_percentage: Number(branch?.loyalty_points_percentage || 0),
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

      // Auto-select the first branch so settings are visible immediately.
      const first = rows?.[0] || null;
      if (first?.branch_id) editBranch(first);
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
        if (data.billing_type) {
          localStorage.setItem("billing_type", data.billing_type.toLowerCase());
        }
        setHotelShop(isHotelShop(data));
      })
      .catch(() => {
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

    if (hotelShop && form.service_charge_required) {
      const amount = Number(form.service_charge_amount || 0);
      if (!amount || amount < 0) {
        showToast("Enter a valid service charge amount", "error");
        return;
      }
    }

    const loyaltyPointsPercentage = Number(form.loyalty_points_percentage || 0);
    if (Number.isNaN(loyaltyPointsPercentage) || loyaltyPointsPercentage < 0 || loyaltyPointsPercentage > 100) {
      showToast("Enter loyalty points percentage between 0 and 100", "error");
      return;
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
        loyalty_points_percentage: Number(form.loyalty_points_percentage || 0),
        online_orders_status_sync_timeout_sec: timeout,
      };

      if (editingId) {
        await api.put(`/branch/${editingId}`, payload);
        showToast("Branch updated", "success");
        // Keep form populated — just refresh the branch list silently
        api.get("/branch/scoped").then((res) => {
          setBranches(res.data || []);
        }).catch(() => {});
      } else {
        await api.post("/branch/create", payload);
        showToast("Branch created", "success");
        setForm(emptyForm);
        setEditingId(null);
        await loadBranches();
      }
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

  const handleNewBranch = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${BLUE}15` }}
            >
              <MdBusiness size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Branch Management</h1>
              <p className="text-xs text-slate-500">Manage your store locations and settings</p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={handleNewBranch}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium shadow-sm hover:opacity-90 transition"
              style={{ background: BLUE }}
            >
              <FaPlus size={12} />
              New Branch
            </button>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6">
        {/* Left — Branch List */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            All Branches ({branches.length})
          </div>

          {branches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <FaStore size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500">No branches yet</p>
              <p className="text-xs text-slate-400 mt-1">Create your first branch to get started</p>
            </div>
          ) : (
            branches.map((branch) => (
              <BranchCard
                key={branch.branch_id}
                branch={branch}
                isSelected={editingId === branch.branch_id}
                isAdmin={isAdmin}
                hotelShop={hotelShop}
                onEdit={() => editBranch(branch)}
                onToggle={() =>
                  toggleStatus(
                    branch.branch_id,
                    branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                  )
                }
                onTables={() => navigate(`/setup/branches/${branch.branch_id}/tables`)}
              />
            ))
          )}
        </div>

        {/* Right — Form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Form Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">
                {editingId ? "Edit Branch" : "Create New Branch"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingId
                  ? "Update branch details and configuration"
                  : "Fill in the details to add a new branch"}
              </p>
            </div>
            {!isAdmin && editingId ? (
              <span className="text-[11px] px-3 py-1 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-100">
                Your Branch
              </span>
            ) : null}
          </div>

          <div className="p-6 space-y-6">
            {/* Branch Details */}
            <FormSection
              icon={<MdLocationOn size={16} />}
              title="Branch Details"
              subtitle="Basic information about this location"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Branch Name" required>
                  <input
                    className={inputClass}
                    placeholder="e.g. Main Store, Koramangala"
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
                    placeholder="Street address"
                    value={form.address_line1 || ""}
                    onChange={(e) => setField("address_line1", e.target.value)}
                  />
                </Field>
                <Field label="Address Line 2">
                  <input
                    className={inputClass}
                    placeholder="Apt, suite, landmark"
                    value={form.address_line2 || ""}
                    onChange={(e) => setField("address_line2", e.target.value)}
                  />
                </Field>
                <Field label="City" required>
                  <input
                    className={inputClass}
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                  />
                </Field>
                <Field label="State">
                  <input
                    className={inputClass}
                    placeholder="State"
                    value={form.state || ""}
                    onChange={(e) => setField("state", e.target.value)}
                  />
                </Field>
                <Field label="Country" required>
                  <input
                    className={inputClass}
                    placeholder="Country"
                    value={form.country}
                    onChange={(e) => setField("country", e.target.value)}
                  />
                </Field>
                <Field label="Pincode">
                  <input
                    className={inputClass}
                    placeholder="Pincode / ZIP"
                    value={form.pincode || ""}
                    onChange={(e) => setField("pincode", e.target.value)}
                  />
                </Field>
              </div>
            </FormSection>

            {/* Default Discount */}
            <FormSection
              icon={<span className="text-sm font-bold">%</span>}
              title="Default Discount"
              subtitle="Auto-apply a discount for this branch"
            >
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
              {form.discount_enabled && (
                <div className="grid md:grid-cols-2 gap-4 mt-2">
                  <Field label="Discount Type">
                    <select
                      className={inputClass}
                      value={String(form.discount_type || "flat").toLowerCase()}
                      onChange={(e) => setField("discount_type", e.target.value)}
                    >
                      <option value="flat">Flat (₹)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                  </Field>
                  <Field label="Discount Value">
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="0"
                      value={form.discount_value}
                      onChange={(e) => setField("discount_value", e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </FormSection>

            {/* Loyalty Points */}
            <FormSection
              icon={<span className="text-sm font-bold">★</span>}
              title="Loyalty Points"
              subtitle="Award customer points as a percent of invoice total"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Points percentage">
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="0"
                    value={form.loyalty_points_percentage}
                    onChange={(e) => setField("loyalty_points_percentage", e.target.value)}
                  />
                </Field>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-600">Hint</div>
                  <div className="text-[11px] text-slate-500">
                    Enter a number from 0 to 100. Points are calculated on invoice total after discount.
                  </div>
                </div>
              </div>
            </FormSection>

            {hotelShop && (
              <FormSection
                icon={<FaTable size={14} />}
                title="Order Live Tracking"
                subtitle="Control live tracking screens for this branch"
              >
                <ToggleRow
                  label="Enable order live tracking"
                  hint="Shows Order Live and KOT status management menus for this branch."
                  checked={Boolean(form.order_live_tracking_enabled)}
                  onChange={(checked) => setField("order_live_tracking_enabled", checked)}
                />
              </FormSection>
            )}

            {/* Printing */}
            <FormSection
              icon={<FaUtensils size={14} />}
              title="Printing"
              subtitle="Configure print behavior for this branch"
            >
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
                <ToggleRow
                  label="Feedback QR on receipt"
                  hint="Print feedback QR code at the bottom of receipts."
                  checked={Boolean(form.feedback_qr_enabled)}
                  onChange={(checked) => setField("feedback_qr_enabled", checked)}
                />
                <ToggleRow
                  label="Logo on receipt"
                  hint="Print shop logo at the top of receipts."
                  checked={Boolean(form.print_logo_enabled)}
                  onChange={(checked) => setField("print_logo_enabled", checked)}
                />
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Paper Size</p>
                    <p className="text-xs text-slate-400 mt-0.5">Thermal printer roll width</p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200">
                    {["58mm", "80mm"].map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setField("paper_size", size)}
                        className={`px-4 py-1.5 text-xs font-semibold transition ${
                          form.paper_size === size
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="py-2 space-y-1.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700">FSSAI Number</p>
                    <p className="text-xs text-slate-400 mt-0.5">Branch-specific FSSAI (leave blank to use shop-level)</p>
                  </div>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                    placeholder="e.g. 11223344556677"
                    value={form.fssai_number || ""}
                    onChange={e => setField("fssai_number", e.target.value)}
                  />
                </div>
              </div>
            </FormSection>

            {hotelShop && (
              <FormSection
                icon={<span className="text-sm font-bold">₹</span>}
                title="Service Charge"
                subtitle="Apply a fixed service charge for this branch"
              >
                <ToggleRow
                  label="Service charge required"
                  hint="Adds the configured amount to every table bill."
                  checked={Boolean(form.service_charge_required)}
                  onChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      service_charge_required: checked,
                      service_charge_amount: checked ? prev.service_charge_amount || 0 : 0,
                    }))
                  }
                />
                {form.service_charge_required && (
                  <div className="grid md:grid-cols-2 gap-4 mt-2">
                    <Field label="Service Charge Amount">
                      <input
                        type="number"
                        className={inputClass}
                        placeholder="0"
                        value={form.service_charge_amount}
                        onChange={(e) => setField("service_charge_amount", e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </FormSection>
            )}

            {/* Online Orders */}
            <FormSection
              icon={<FaMotorcycle size={15} />}
              title="Online Orders"
              subtitle="Delivery platform integrations and webhook settings"
            >
              {/* Webhook info */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                <p className="text-xs text-blue-700 font-medium mb-1">Webhook Endpoint</p>
                <p className="text-[11px] font-mono text-blue-800 break-all">
                  {webhookBase}/{"{PROVIDER}"}/{shopId}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <ToggleRow
                  label="Auto accept orders"
                  hint="Accept new online orders automatically."
                  checked={Boolean(form.online_orders_auto_accept)}
                  onChange={(checked) => setField("online_orders_auto_accept", checked)}
                />
                <ToggleRow
                  label="Require webhook signature"
                  hint="Reject unsigned webhooks."
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
                  hint="Fail the action if provider sync call fails."
                  checked={Boolean(form.online_orders_status_sync_strict)}
                  onChange={(checked) => setField("online_orders_status_sync_strict", checked)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
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

              {/* Provider Cards */}
              <div className="grid lg:grid-cols-2 gap-4">
                <ProviderCard
                  title="Swiggy"
                  color="#FC8019"
                  enabled={Boolean(form.swiggy_enabled)}
                  onToggle={(checked) => setField("swiggy_enabled", checked)}
                >
                  <Field label="Partner ID">
                    <input
                      className={inputClass}
                      value={form.swiggy_partner_id || ""}
                      onChange={(e) => setField("swiggy_partner_id", e.target.value)}
                    />
                  </Field>
                  <SecretField
                    label="Webhook Secret"
                    value={form.swiggy_webhook_secret || ""}
                    onChange={(e) => setField("swiggy_webhook_secret", e.target.value)}
                  />
                  <Field label="Status Sync URL">
                    <input
                      className={inputClass}
                      value={form.swiggy_status_sync_url || ""}
                      onChange={(e) => setField("swiggy_status_sync_url", e.target.value)}
                    />
                  </Field>
                  <SecretField
                    label="Status Sync Token"
                    value={form.swiggy_status_sync_token || ""}
                    onChange={(e) => setField("swiggy_status_sync_token", e.target.value)}
                  />
                  <SecretField
                    label="Status Sync Secret"
                    value={form.swiggy_status_sync_secret || ""}
                    onChange={(e) => setField("swiggy_status_sync_secret", e.target.value)}
                  />
                </ProviderCard>

                <ProviderCard
                  title="Zomato"
                  color="#E23744"
                  enabled={Boolean(form.zomato_enabled)}
                  onToggle={(checked) => setField("zomato_enabled", checked)}
                >
                  <Field label="Partner ID">
                    <input
                      className={inputClass}
                      value={form.zomato_partner_id || ""}
                      onChange={(e) => setField("zomato_partner_id", e.target.value)}
                    />
                  </Field>
                  <SecretField
                    label="Webhook Secret"
                    value={form.zomato_webhook_secret || ""}
                    onChange={(e) => setField("zomato_webhook_secret", e.target.value)}
                  />
                  <Field label="Status Sync URL">
                    <input
                      className={inputClass}
                      value={form.zomato_status_sync_url || ""}
                      onChange={(e) => setField("zomato_status_sync_url", e.target.value)}
                    />
                  </Field>
                  <SecretField
                    label="Status Sync Token"
                    value={form.zomato_status_sync_token || ""}
                    onChange={(e) => setField("zomato_status_sync_token", e.target.value)}
                  />
                  <SecretField
                    label="Status Sync Secret"
                    value={form.zomato_status_sync_secret || ""}
                    onChange={(e) => setField("zomato_status_sync_secret", e.target.value)}
                  />
                </ProviderCard>
              </div>
            </FormSection>

            {/* Save Button */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveBranch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
                style={{ background: BLUE }}
              >
                {editingId ? <FaEdit size={13} /> : <FaPlus size={13} />}
                {loading ? "Saving…" : editingId ? "Update Branch" : "Create Branch"}
              </button>
              {editingId && isAdmin && (
                <button
                  onClick={handleNewBranch}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  + New Branch
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Branch Card ───────────────────────── */
function BranchCard({ branch, isSelected, isAdmin, hotelShop, onEdit, onToggle, onTables }) {
  const active = branch.status === "ACTIVE";
  return (
    <div
      className={`bg-white rounded-2xl border-2 transition cursor-pointer ${
        isSelected ? "border-blue-500 shadow-md" : "border-transparent shadow-sm hover:border-slate-200"
      }`}
      onClick={onEdit}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isSelected ? "#0B3C8C15" : "#f1f5f9" }}
            >
              <FaStore size={15} style={{ color: isSelected ? "#0B3C8C" : "#64748b" }} />
            </div>
            <div>
              <div className="font-semibold text-sm text-slate-800">{branch.branch_name}</div>
              {branch.city ? (
                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MdLocationOn size={11} />
                  {branch.city}
                </div>
              ) : null}
            </div>
          </div>
          <span
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-red-50 text-red-600 border border-red-100"
            }`}
          >
            {active ? <FaCheckCircle size={9} /> : <FaTimesCircle size={9} />}
            {active ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Online order badges */}
        {(branch.swiggy_enabled || branch.zomato_enabled) && (
          <div className="flex gap-2 mt-3">
            {branch.swiggy_enabled && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                Swiggy
              </span>
            )}
            {branch.zomato_enabled && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                Zomato
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            <FaEdit size={10} /> Edit
          </button>
          {hotelShop && (
            <button
              onClick={(e) => { e.stopPropagation(); onTables(); }}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              <FaTable size={10} /> Tables
            </button>
          )}
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                active
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {active ? "Disable" : "Enable"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Form Section ───────────────────────── */
function FormSection({ icon, title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

/* ───────────────────────── Field ───────────────────────── */
function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ───────────────────────── Toggle Row ───────────────────────── */
function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 cursor-pointer hover:border-blue-200 transition">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
      </div>
      <div className="relative flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`w-10 h-5 rounded-full transition-colors ${
            checked ? "bg-blue-600" : "bg-slate-200"
          }`}
        />
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </label>
  );
}

/* ───────────────────────── Provider Card ───────────────────────── */
function ProviderCard({ title, color, enabled, onToggle, children }) {
  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden transition ${
        enabled ? "border-current" : "border-slate-100"
      }`}
      style={{ borderColor: enabled ? `${color}40` : undefined }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: enabled ? `${color}10` : "#f8fafc" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: color }}
          />
          <span className="text-sm font-bold" style={{ color: enabled ? color : "#64748b" }}>
            {title}
          </span>
        </div>
        <label className="relative flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            className="sr-only"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <div
            className="w-10 h-5 rounded-full transition-colors"
            style={{ background: enabled ? color : "#e2e8f0" }}
          />
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </label>
      </div>
      {enabled && <div className="p-4 space-y-3 bg-white">{children}</div>}
    </div>
  );
}

/* ───────────────────────── Secret Field ───────────────────────── */
function SecretField({ label, value, onChange }) {
  const [show, setShow] = useState(false);

  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white pr-16 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}
