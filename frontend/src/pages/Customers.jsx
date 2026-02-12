import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

const emptyForm = {
  customer_id: null,
  customer_name: "",
  mobile: "",
  email: "",
  gst_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  status: "ACTIVE"
};

export default function Customers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const canManage = roleLower === "admin" || roleLower === "manager";

  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [duesLoading, setDuesLoading] = useState(false);
  const [dues, setDues] = useState([]);

  const selectedMobile = useMemo(() => (form?.mobile || "").trim(), [form?.mobile]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/customers/search", {
        params: { q: q || undefined, limit: 200 }
      });
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load customers";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const loadDues = async (mobile) => {
    if (!mobile || String(mobile).replace(/\D/g, "").length < 10) {
      setDues([]);
      return;
    }
    setDuesLoading(true);
    try {
      const res = await authAxios.get("/dues/open", { params: { q: mobile } });
      setDues(res.data || []);
    } catch {
      setDues([]);
    } finally {
      setDuesLoading(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    load();
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    loadDues(selectedMobile);
  }, [selectedMobile, canManage]);

  const selectRow = (r) => {
    setForm({
      ...emptyForm,
      ...r,
      customer_id: r.customer_id ?? null,
      status: r.status || "ACTIVE"
    });
  };

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const reset = () => {
    setForm(emptyForm);
    setDues([]);
  };

  const save = async () => {
    if (!form.customer_name?.trim()) return showToast("Customer name required", "error");
    if (!form.mobile?.trim()) return showToast("Mobile required", "error");

    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name?.trim(),
        mobile: form.mobile?.trim(),
        email: form.email?.trim() || null,
        gst_number: form.gst_number?.trim() || null,
        address_line1: form.address_line1?.trim() || null,
        address_line2: form.address_line2?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        pincode: form.pincode?.trim() || null,
        status: form.status || "ACTIVE"
      };

      const res = await authAxios.post("/customers/", payload);
      const saved = res?.data || null;
      showToast("Customer saved", "success");
      if (saved) selectRow(saved);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Save failed";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">
      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Customers</div>
        <div />
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-gray-600">Search</label>
            <input
              className="w-full border rounded-lg px-2 py-1"
              placeholder="Name / mobile..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
            disabled={loading}
          >
            {loading ? "Loading..." : "Search"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm"
          >
            New
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg overflow-x-auto">
          {loading ? (
            <div className="p-3 text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-gray-500">No customers</div>
          ) : (
            <table className="min-w-[700px] w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Mobile</th>
                  <th className="p-2">GST</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.customer_id}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => selectRow(r)}
                  >
                    <td className="p-2 font-semibold">{r.customer_name}</td>
                    <td className="p-2">{r.mobile}</td>
                    <td className="p-2">{r.gst_number || "-"}</td>
                    <td className="p-2">{r.status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Customer Details</div>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-600">Name</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.customer_name}
                onChange={e => update({ customer_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">Mobile</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.mobile}
                onChange={e => update({ mobile: e.target.value })}
                placeholder="10-digit mobile"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">Email</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.email || ""}
                onChange={e => update({ email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">GST Number</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.gst_number || ""}
                onChange={e => update({ gst_number: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-gray-600">Address Line 1</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.address_line1 || ""}
                onChange={e => update({ address_line1: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-gray-600">Address Line 2</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.address_line2 || ""}
                onChange={e => update({ address_line2: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">City</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.city || ""}
                onChange={e => update({ city: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">State</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.state || ""}
                onChange={e => update({ state: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">Pincode</label>
              <input
                className="w-full border rounded-lg px-2 py-1"
                value={form.pincode || ""}
                onChange={e => update({ pincode: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">Status</label>
              <select
                className="w-full border rounded-lg px-2 py-1"
                value={form.status || "ACTIVE"}
                onChange={e => update({ status: e.target.value })}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Open Dues</div>
              <button
                onClick={() => loadDues(selectedMobile)}
                className="px-3 py-1.5 rounded-lg border bg-white shadow-sm"
                disabled={duesLoading}
              >
                {duesLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {duesLoading ? (
              <div className="text-gray-500">Loading dues...</div>
            ) : dues.length === 0 ? (
              <div className="text-gray-500">No open dues for this customer</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[650px] w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2">Invoice</th>
                      <th className="p-2 text-right">Original</th>
                      <th className="p-2 text-right">Paid</th>
                      <th className="p-2 text-right">Returns</th>
                      <th className="p-2 text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dues.map(d => (
                      <tr key={d.due_id} className="border-t">
                        <td className="p-2 font-semibold">{d.invoice_number}</td>
                        <td className="p-2 text-right">{Number(d.original_amount || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(d.paid_amount || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(d.returns_amount || 0).toFixed(2)}</td>
                        <td className="p-2 text-right font-bold">
                          {Number(d.outstanding_amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

