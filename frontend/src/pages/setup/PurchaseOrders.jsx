import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import * as XLSX from "xlsx";
import { API_BASE } from "../../config/api";

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession();
  const isAdmin = (session?.role || "").toLowerCase() === "admin";
  const apiOrigin = String(API_BASE || "").replace(/\/api\/?$/, "");

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [pos, setPos] = useState([]);
  const [activePo, setActivePo] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveRows, setReceiveRows] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    payment_status: "UNPAID",
    paid_amount: ""
  });

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachUploading, setAttachUploading] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    expected_date: "",
    notes: ""
  });

  const [poItems, setPoItems] = useState([
    { item_id: "", qty: 1, unit_cost: "" }
  ]);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/list");
      setBranches(res.data || []);
    } catch {}
  };

  const loadSuppliers = async () => {
    try {
      const res = await authAxios.get("/suppliers/", {
        params: { branch_id: isAdmin ? branchId : undefined }
      });
      setSuppliers(res.data || []);
    } catch {
      showToast("Failed to load suppliers", "error");
    }
  };

  const loadItems = async () => {
    try {
      const res = await authAxios.get("/items/");
      setItems(res.data || []);
    } catch {
      showToast("Failed to load items", "error");
    }
  };

  const loadPOs = async () => {
    try {
      const res = await authAxios.get("/purchase-orders/", {
        params: { branch_id: isAdmin ? branchId : undefined }
      });
      setPos(res.data || []);
    } catch {
      showToast("Failed to load POs", "error");
    }
  };

  useEffect(() => {
    loadBranches();
    loadItems();
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadPOs();
  }, [branchId]);

  const addRow = () =>
    setPoItems(prev => [...prev, { item_id: "", qty: 1, unit_cost: "" }]);

  const removeRow = idx =>
    setPoItems(prev => prev.filter((_, i) => i !== idx));

  const updateRow = (idx, key, value) => {
    const clone = [...poItems];
    clone[idx] = { ...clone[idx], [key]: value };
    setPoItems(clone);
  };

  const totalAmount = poItems.reduce((sum, r) => {
    const qty = Number(r.qty || 0);
    const cost = Number(r.unit_cost || 0);
    return sum + qty * cost;
  }, 0);

  const savePO = async () => {
    if (!form.supplier_id) return showToast("Select supplier", "error");
    if (poItems.length === 0) return showToast("Add items", "error");

    const itemsPayload = poItems
      .filter(i => i.item_id && Number(i.qty) > 0)
      .map(i => ({
        item_id: Number(i.item_id),
        qty: Number(i.qty),
        unit_cost: Number(i.unit_cost) || undefined
      }));

    if (itemsPayload.length === 0) return showToast("Add valid items", "error");

    try {
      await authAxios.post("/purchase-orders/", {
        supplier_id: Number(form.supplier_id),
        branch_id: isAdmin ? Number(branchId) : undefined,
        expected_date: form.expected_date || undefined,
        notes: form.notes || undefined,
        status: "DRAFT",
        payment_status: "UNPAID",
        items: itemsPayload
      });
      setForm({ supplier_id: "", expected_date: "", notes: "" });
      setPoItems([{ item_id: "", qty: 1, unit_cost: "" }]);
      loadPOs();
      showToast("PO created", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "PO create failed", "error");
    }
  };

  const openReceive = po => {
    setActivePo(po);
    const rows = (po.items || []).map(i => ({
      item_id: i.item_id,
      item_name: i.item_name,
      remaining: i.qty_ordered - i.qty_received,
      qty_received: 0
    }));
    setReceiveRows(rows);
    setReceiveOpen(true);
  };

  const openPayment = po => {
    setActivePo(po);
    setPaymentForm({
      payment_status: po.payment_status || "UNPAID",
      paid_amount: po.paid_amount || ""
    });
    setPaymentOpen(true);
  };

  const importExcel = async file => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows || rows.length === 0) {
        showToast("Excel is empty", "error");
        return;
      }

      const normalize = obj => {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
          out[String(k || "").trim().toLowerCase()] = v;
        }
        return out;
      };

      const byName = name => {
        const n = String(name || "").trim().toLowerCase();
        if (!n) return null;
        return items.find(i => String(i.item_name || "").trim().toLowerCase() === n) || null;
      };

      const imported = [];
      for (const raw of rows) {
        const r = normalize(raw);
        const itemIdRaw = r.item_id ?? r.itemid ?? r["item id"];
        const itemNameRaw = r.item_name ?? r.itemname ?? r["item name"];
        const qtyRaw = r.qty ?? r.quantity ?? r["qty ordered"];
        const costRaw = r.unit_cost ?? r.unitcost ?? r.cost ?? r["unit cost"];

        let itemId = itemIdRaw ? Number(itemIdRaw) : null;
        if (!itemId && itemNameRaw) {
          const match = byName(itemNameRaw);
          itemId = match ? Number(match.item_id) : null;
        }

        const qty = Number(qtyRaw || 0);
        const unitCost = costRaw === "" ? "" : Number(costRaw || 0);

        if (!itemId || !qty || qty <= 0) continue;
        imported.push({
          item_id: String(itemId),
          qty: qty,
          unit_cost: unitCost && unitCost > 0 ? String(unitCost) : ""
        });
      }

      if (imported.length === 0) {
        showToast("No valid rows. Expected columns: item_id or item_name, qty, unit_cost", "error");
        return;
      }

      setPoItems(imported);
      showToast(`Imported ${imported.length} rows`, "success");
    } catch {
      showToast("Excel import failed", "error");
    }
  };

  const loadAttachments = async po => {
    if (!po?.po_id) return;
    try {
      const res = await authAxios.get(`/purchase-orders/${po.po_id}/attachments`);
      setAttachments(res.data || []);
    } catch {
      setAttachments([]);
    }
  };

  const openAttachments = async po => {
    setActivePo(po);
    setAttachOpen(true);
    setAttachments([]);
    await loadAttachments(po);
  };

  const uploadAttachment = async file => {
    if (!activePo?.po_id || !file) return;
    setAttachUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await authAxios.post(`/purchase-orders/${activePo.po_id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      showToast("Uploaded", "success");
      await loadAttachments(activePo);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Upload failed", "error");
    } finally {
      setAttachUploading(false);
    }
  };

  const deleteAttachment = async attachmentId => {
    if (!activePo?.po_id || !attachmentId) return;
    try {
      await authAxios.delete(`/purchase-orders/${activePo.po_id}/attachments/${attachmentId}`);
      showToast("Deleted", "success");
      await loadAttachments(activePo);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Delete failed", "error");
    }
  };

  const submitReceive = async () => {
    if (!activePo) return;
    const payload = {
      items: receiveRows
        .filter(r => Number(r.qty_received) > 0)
        .map(r => ({
          item_id: r.item_id,
          qty_received: Number(r.qty_received)
        }))
    };
    if (payload.items.length === 0) return showToast("Enter qty to receive", "error");

    try {
      await authAxios.post(`/purchase-orders/${activePo.po_id}/receive`, payload);
      setReceiveOpen(false);
      setActivePo(null);
      loadPOs();
      showToast("Stock received", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Receive failed", "error");
    }
  };

  const submitPayment = async () => {
    if (!activePo) return;
    try {
      await authAxios.post(`/purchase-orders/${activePo.po_id}/payment`, {
        payment_status: paymentForm.payment_status,
        paid_amount: Number(paymentForm.paid_amount) || 0
      });
      setPaymentOpen(false);
      setActivePo(null);
      loadPOs();
      showToast("Payment updated", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Payment update failed", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-800">Purchase Orders</h2>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-slate-600">Branch</span>
          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
            value={branchId}
            onChange={e => setBranchId(Number(e.target.value))}
          >
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 rounded-xl border bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold">Create PO</h3>

          <select
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            value={form.supplier_id}
            onChange={e => setForm({ ...form, supplier_id: e.target.value })}
          >
            <option value="">Select Supplier</option>
            {suppliers.map(s => (
              <option key={s.supplier_id} value={s.supplier_id}>
                {s.supplier_name}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            value={form.expected_date}
            onChange={e => setForm({ ...form, expected_date: e.target.value })}
          />

          <textarea
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Notes"
            rows={2}
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />

          <div className="space-y-2 pt-1">
            {poItems.map((r, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_70px_24px] gap-2">
                <select
                  className="border rounded-lg px-2 py-1.5 text-[12px]"
                  value={r.item_id}
                  onChange={e => updateRow(idx, "item_id", e.target.value)}
                >
                  <option value="">Item</option>
                  {items.map(i => (
                    <option key={i.item_id} value={i.item_id}>
                      {i.item_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1.5 text-[12px]"
                  placeholder="Qty"
                  value={r.qty}
                  onChange={e => updateRow(idx, "qty", e.target.value)}
                />
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1.5 text-[12px]"
                  placeholder="Cost"
                  value={r.unit_cost}
                  onChange={e => updateRow(idx, "unit_cost", e.target.value)}
                />
                {poItems.length > 1 && (
                  <button
                    onClick={() => removeRow(idx)}
                    className="text-red-500 text-sm"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 text-[12px]">
            <button onClick={addRow} className="px-2 py-1 border rounded-lg">
              + Item
            </button>
            <span className="font-semibold">Total: Rs. {totalAmount.toFixed(2)}</span>
          </div>

          <div className="pt-2">
            <label className="text-[11px] text-slate-600">
              Import items from Excel (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="block mt-1 text-[11px]"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (file) await importExcel(file);
                e.target.value = "";
              }}
            />
            <div className="text-[10px] text-slate-500 mt-1">
              Columns: item_id or item_name, qty, unit_cost
            </div>
          </div>

          <button
            onClick={savePO}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[12px]"
          >
            Save PO
          </button>
        </div>

        <div className="col-span-2 rounded-xl border bg-white p-3 space-y-2">
          {pos.map(p => {
            const statusText = String(p.status || "").trim().toUpperCase();
            const isClosed = statusText == "CLOSED";
            return (
            <div key={p.po_id} className="border rounded-xl p-3">
              <div className="flex justify-between items-center">
                <div className="text-[12px] font-semibold">
                  {p.po_number} - {statusText || "DRAFT"}
                </div>
                <div className="text-[11px] text-slate-500">
                  Total Rs. {Number(p.total_amount || 0).toFixed(2)}
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Supplier ID: {p.supplier_id} - Payment: {p.payment_status}
              </div>
              <div className="mt-2 flex gap-2">
                {!isClosed && (
                  <button
                    onClick={() => openReceive(p)}
                    className="px-2 py-1 border rounded-lg text-[11px]"
                  >
                    Receive
                  </button>
                )}
                <button
                  onClick={() => openPayment(p)}
                  className="px-2 py-1 border rounded-lg text-[11px]"
                >
                  Payment
                </button>
                <button
                  onClick={() => openAttachments(p)}
                  className="px-2 py-1 border rounded-lg text-[11px]"
                >
                  Attachments
                </button>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {receiveOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-semibold">Receive Items</h3>
              <button onClick={() => setReceiveOpen(false)}>x</button>
            </div>
            <div className="space-y-2 text-[12px]">
              {receiveRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center">
                  <div>{r.item_name}</div>
                  <div className="text-slate-500">Bal: {r.remaining}</div>
                  <input
                    type="number"
                    min="0"
                    className="border rounded px-2 py-1"
                    value={r.qty_received}
                    onChange={e => {
                      const clone = [...receiveRows];
                      clone[idx] = { ...clone[idx], qty_received: e.target.value };
                      setReceiveRows(clone);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setReceiveOpen(false)}
                className="px-3 py-1 border rounded-lg text-[12px]"
              >
                Cancel
              </button>
              <button
                onClick={submitReceive}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[12px]"
              >
                Receive
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-semibold">Update Payment</h3>
              <button onClick={() => setPaymentOpen(false)}>x</button>
            </div>

            <div className="space-y-3 text-[12px]">
              <div>
                <label className="text-slate-600">Status</label>
                <select
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={paymentForm.payment_status}
                  onChange={e =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_status: e.target.value
                    })}
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PARTIAL">PARTIAL</option>
                  <option value="PAID">PAID</option>
                </select>
              </div>

              <div>
                <label className="text-slate-600">Paid Amount</label>
                <input
                  type="number"
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={paymentForm.paid_amount}
                  onChange={e =>
                    setPaymentForm({
                      ...paymentForm,
                      paid_amount: e.target.value
                    })}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPaymentOpen(false)}
                className="px-3 py-1 border rounded-lg text-[12px]"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[12px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {attachOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-5 w-full max-w-2xl">
            <div className="flex justify-between mb-3">
              <h3 className="text-sm font-semibold">
                Attachments {activePo?.po_number ? `- ${activePo.po_number}` : ""}
              </h3>
              <button
                onClick={() => {
                  setAttachOpen(false);
                  setAttachments([]);
                  setActivePo(null);
                }}
              >
                x
              </button>
            </div>

            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
                  disabled={attachUploading}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) await uploadAttachment(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => loadAttachments(activePo)}
                  className="px-2 py-1 border rounded-lg text-[11px]"
                >
                  Refresh
                </button>
                {attachUploading && (
                  <span className="text-[11px] text-slate-500">Uploading...</span>
                )}
              </div>

              {attachments.length === 0 ? (
                <div className="text-slate-500">No attachments</div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-[900px] w-full text-left text-[12px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2">File</th>
                        <th className="p-2 text-right">Size</th>
                        <th className="p-2">View</th>
                        <th className="p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachments.map(a => (
                        <tr key={a.attachment_id} className="border-t">
                          <td className="p-2 font-semibold">{a.original_filename}</td>
                          <td className="p-2 text-right">
                            {a.size_bytes ? `${(a.size_bytes / 1024).toFixed(1)} KB` : "-"}
                          </td>
                          <td className="p-2">
                            {a.url ? (
                              <a
                                href={`${apiOrigin}${a.url}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline"
                              >
                                Open
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2">
                            <button
                              onClick={() => deleteAttachment(a.attachment_id)}
                              className="px-2 py-1 border rounded-lg text-[11px] text-rose-600"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setAttachOpen(false);
                  setAttachments([]);
                  setActivePo(null);
                }}
                className="px-3 py-1 border rounded-lg text-[12px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



