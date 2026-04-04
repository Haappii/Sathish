import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import * as XLSX from "xlsx";
import { API_BASE } from "../../config/api";
import BackButton from "../../components/BackButton";
import {
  FaPlus, FaTrash, FaFileInvoice, FaDownload,
  FaPaperclip, FaMoneyBillWave, FaTruck,
} from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { MdFileUpload } from "react-icons/md";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

const STATUS_STYLE = {
  DRAFT:    "bg-slate-100 text-slate-600 border-slate-200",
  ORDERED:  "bg-blue-50 text-blue-700 border-blue-100",
  RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PARTIAL:  "bg-amber-50 text-amber-700 border-amber-100",
  CLOSED:   "bg-slate-100 text-slate-400 border-slate-200",
};

const PAYMENT_STYLE = {
  UNPAID:  "bg-red-50 text-red-600 border-red-100",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-100",
  PAID:    "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export default function PurchaseOrders() {
  const { showToast } = useToast();
  const session = getSession();
  const isAdmin = (session?.role || "").toLowerCase() === "admin";
  const apiOrigin = String(API_BASE || "").replace(/\/api\/?$/, "");

  const parseSerialNumbers = (text) => {
    const raw = String(text || "");
    if (!raw.trim()) return [];
    return raw.split(/[\n,]+/g).map(s => s.trim()).filter(Boolean);
  };

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [pos, setPos] = useState([]);

  const [activePo, setActivePo] = useState(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveRows, setReceiveRows] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ payment_status: "UNPAID", paid_amount: "" });
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachUploading, setAttachUploading] = useState(false);

  const [form, setForm] = useState({ supplier_id: "", expected_date: "", notes: "" });
  const [poItems, setPoItems] = useState([{ item_id: "", qty: 1, unit_cost: "" }]);
  const [saving, setSaving] = useState(false);

  /* ── load ── */
  const loadBranches = async () => {
    if (!isAdmin) return;
    try { const res = await authAxios.get("/branch/active"); setBranches(res.data || []); } catch {}
  };
  const loadSuppliers = async () => {
    try { const res = await authAxios.get("/suppliers/", { params: { branch_id: isAdmin ? branchId : undefined } }); setSuppliers(res.data || []); }
    catch { showToast("Failed to load suppliers", "error"); }
  };
  const loadItems = async () => {
    try { const res = await authAxios.get("/items/"); setItems(res.data || []); }
    catch { showToast("Failed to load items", "error"); }
  };
  const loadPOs = async () => {
    try { const res = await authAxios.get("/purchase-orders/", { params: { branch_id: isAdmin ? branchId : undefined } }); setPos(res.data || []); }
    catch { showToast("Failed to load POs", "error"); }
  };

  useEffect(() => { loadBranches(); loadItems(); }, []);
  useEffect(() => { loadSuppliers(); loadPOs(); }, [branchId]);

  /* ── po items ── */
  const addRow = () => setPoItems(prev => [...prev, { item_id: "", qty: 1, unit_cost: "" }]);
  const removeRow = idx => setPoItems(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, key, value) => {
    const clone = [...poItems];
    clone[idx] = { ...clone[idx], [key]: value };
    setPoItems(clone);
  };
  const totalAmount = poItems.reduce((sum, r) => sum + Number(r.qty || 0) * Number(r.unit_cost || 0), 0);

  /* ── save PO ── */
  const savePO = async () => {
    if (!form.supplier_id) return showToast("Select supplier", "error");
    const itemsPayload = poItems
      .filter(i => i.item_id && Number(i.qty) > 0)
      .map(i => ({ item_id: Number(i.item_id), qty: Number(i.qty), unit_cost: Number(i.unit_cost) || undefined }));
    if (!itemsPayload.length) return showToast("Add valid items", "error");
    setSaving(true);
    try {
      await authAxios.post("/purchase-orders/", {
        supplier_id: Number(form.supplier_id),
        branch_id: isAdmin ? Number(branchId) : undefined,
        expected_date: form.expected_date || undefined,
        notes: form.notes || undefined,
        status: "DRAFT", payment_status: "UNPAID",
        items: itemsPayload,
      });
      setForm({ supplier_id: "", expected_date: "", notes: "" });
      setPoItems([{ item_id: "", qty: 1, unit_cost: "" }]);
      loadPOs();
      showToast("PO created", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "PO create failed", "error");
    } finally { setSaving(false); }
  };

  /* ── helpers ── */
  const supplierNameById = id => suppliers.find(x => Number(x.supplier_id) === Number(id))?.supplier_name || `#${id}`;

  const openReceive = po => {
    setActivePo(po);
    setReceiveRows((po.items || []).map(i => ({
      item_id: i.item_id, item_name: i.item_name,
      remaining: i.qty_ordered - i.qty_received,
      qty_received: 0, batch_no: "", expiry_date: "", serial_numbers_text: "",
    })));
    setReceiveOpen(true);
  };

  const openPayment = po => {
    setActivePo(po);
    setPaymentForm({ payment_status: po.payment_status || "UNPAID", paid_amount: po.paid_amount || "" });
    setPaymentOpen(true);
  };

  const loadAttachments = async po => {
    if (!po?.po_id) return;
    try { const res = await authAxios.get(`/purchase-orders/${po.po_id}/attachments`); setAttachments(res.data || []); }
    catch { setAttachments([]); }
  };

  const openAttachments = async po => {
    setActivePo(po); setAttachOpen(true); setAttachments([]);
    await loadAttachments(po);
  };

  /* ── excel import ── */
  const importExcel = async file => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows?.length) { showToast("Excel is empty", "error"); return; }
      const norm = obj => { const o = {}; for (const [k, v] of Object.entries(obj || {})) o[k.trim().toLowerCase()] = v; return o; };
      const byName = name => { const n = String(name || "").trim().toLowerCase(); return n ? items.find(i => i.item_name.trim().toLowerCase() === n) || null : null; };
      const imported = [];
      for (const raw of rows) {
        const r = norm(raw);
        let itemId = r.item_id ?? r.itemid ?? r["item id"] ? Number(r.item_id ?? r.itemid ?? r["item id"]) : null;
        if (!itemId) { const m = byName(r.item_name ?? r.itemname ?? r["item name"]); itemId = m ? Number(m.item_id) : null; }
        const qty = Number(r.qty ?? r.quantity ?? r["qty ordered"] ?? 0);
        const costRaw = r.unit_cost ?? r.unitcost ?? r.cost ?? r["unit cost"];
        const unitCost = costRaw === "" ? "" : Number(costRaw || 0);
        if (!itemId || !qty || qty <= 0) continue;
        imported.push({ item_id: String(itemId), qty, unit_cost: unitCost && unitCost > 0 ? String(unitCost) : "" });
      }
      if (!imported.length) { showToast("No valid rows. Columns: item_id or item_name, qty, unit_cost", "error"); return; }
      setPoItems(imported);
      showToast(`Imported ${imported.length} rows`, "success");
    } catch { showToast("Excel import failed", "error"); }
  };

  /* ── submit receive ── */
  const submitReceive = async () => {
    if (!activePo) return;
    for (const r of receiveRows) {
      const qty = Number(r.qty_received || 0);
      if (qty <= 0) continue;
      const serials = parseSerialNumbers(r.serial_numbers_text);
      if (serials.length > 0 && serials.length !== qty) {
        showToast(`Serial count (${serials.length}) must match qty (${qty}) for ${r.item_name}`, "error"); return;
      }
    }
    const payload = {
      items: receiveRows.filter(r => Number(r.qty_received) > 0).map(r => {
        const serials = parseSerialNumbers(r.serial_numbers_text);
        return { item_id: r.item_id, qty_received: Number(r.qty_received), batch_no: r.batch_no?.trim() || undefined, expiry_date: r.expiry_date || undefined, serial_numbers: serials.length ? serials : undefined };
      })
    };
    if (!payload.items.length) return showToast("Enter qty to receive", "error");
    try {
      await authAxios.post(`/purchase-orders/${activePo.po_id}/receive`, payload);
      setReceiveOpen(false); setActivePo(null); loadPOs();
      showToast("Stock received", "success");
    } catch (e) { showToast(e?.response?.data?.detail || "Receive failed", "error"); }
  };

  /* ── submit payment ── */
  const submitPayment = async () => {
    if (!activePo) return;
    try {
      await authAxios.post(`/purchase-orders/${activePo.po_id}/payment`, {
        payment_status: paymentForm.payment_status,
        paid_amount: Number(paymentForm.paid_amount) || 0,
      });
      setPaymentOpen(false); setActivePo(null); loadPOs();
      showToast("Payment updated", "success");
    } catch (e) { showToast(e?.response?.data?.detail || "Payment update failed", "error"); }
  };

  /* ── upload / delete attachment ── */
  const uploadAttachment = async file => {
    if (!activePo?.po_id || !file) return;
    setAttachUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      await authAxios.post(`/purchase-orders/${activePo.po_id}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("Uploaded", "success");
      await loadAttachments(activePo);
    } catch (e) { showToast(e?.response?.data?.detail || "Upload failed", "error"); }
    finally { setAttachUploading(false); }
  };

  const deleteAttachment = async id => {
    if (!activePo?.po_id || !id) return;
    try {
      await authAxios.delete(`/purchase-orders/${activePo.po_id}/attachments/${id}`);
      showToast("Deleted", "success");
      await loadAttachments(activePo);
    } catch (e) { showToast(e?.response?.data?.detail || "Delete failed", "error"); }
  };

  /* ─────────────────────────── UI ─────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50">

      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaFileInvoice size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Purchase Orders</h1>
              <p className="text-xs text-slate-500">{pos.length} orders</p>
            </div>
          </div>

          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Branch</span>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                value={branchId}
                onChange={e => setBranchId(Number(e.target.value))}
              >
                {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-[400px,1fr] gap-6">

        {/* ── Left: Create PO ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaPlus size={13} style={{ color: BLUE }} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Create Purchase Order</h2>
              <p className="text-xs text-slate-500">Fill details and add items</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Supplier */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Supplier <span className="text-red-400">*</span></label>
              <select className={inputClass} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </select>
            </div>

            {/* Expected Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Expected Date</label>
              <input type="date" className={inputClass} value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Notes</label>
              <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Optional notes…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">Items</label>
                <span className="text-xs font-semibold text-slate-700">Total: ₹{totalAmount.toFixed(2)}</span>
              </div>

              <div className="space-y-2">
                {poItems.map((r, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                      value={r.item_id}
                      onChange={e => updateRow(idx, "item_id", e.target.value)}
                    >
                      <option value="">Item…</option>
                      {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
                    </select>
                    <input
                      type="number"
                      placeholder="Qty"
                      className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                      value={r.qty}
                      onChange={e => updateRow(idx, "qty", e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Cost"
                      className="w-20 border border-slate-200 rounded-xl px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                      value={r.unit_cost}
                      onChange={e => updateRow(idx, "unit_cost", e.target.value)}
                    />
                    {poItems.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition flex-shrink-0">
                        <IoClose size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                <FaPlus size={9} /> Add Item
              </button>
            </div>

            {/* Excel import */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <FaDownload size={11} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Import from Excel</span>
              </div>
              <p className="text-[10px] text-slate-400">Columns: item_id or item_name, qty, unit_cost</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={async e => { const file = e.target.files?.[0]; if (file) await importExcel(file); e.target.value = ""; }}
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-100">
            <button
              onClick={savePO}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
              style={{ background: BLUE }}
            >
              {saving ? "Creating…" : "Create Purchase Order"}
            </button>
          </div>
        </div>

        {/* ── Right: PO List ── */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            Orders ({pos.length})
          </div>

          {pos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <FaFileInvoice size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No purchase orders yet</p>
            </div>
          ) : (
            pos.map(p => {
              const statusText = String(p.status || "DRAFT").trim().toUpperCase();
              const payStatus = String(p.payment_status || "UNPAID").trim().toUpperCase();
              const isClosed = statusText === "CLOSED";
              const due = Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0));
              return (
                <div key={p.po_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-slate-200 transition">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${BLUE}10` }}>
                        <FaFileInvoice size={14} style={{ color: BLUE }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{p.po_number}</p>
                        <p className="text-xs text-slate-500">{supplierNameById(p.supplier_id)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[statusText] || STATUS_STYLE.DRAFT}`}>
                        {statusText}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_STYLE[payStatus] || PAYMENT_STYLE.UNPAID}`}>
                        {payStatus}
                      </span>
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <AmountChip label="Total" value={`₹${Number(p.total_amount || 0).toFixed(2)}`} />
                    <AmountChip label="Paid" value={`₹${Number(p.paid_amount || 0).toFixed(2)}`} color="emerald" />
                    <AmountChip label="Due" value={`₹${due.toFixed(2)}`} color={due > 0 ? "red" : "slate"} />
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {!isClosed && (
                      <button onClick={() => openReceive(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                        <FaTruck size={10} /> Receive
                      </button>
                    )}
                    <button onClick={() => openPayment(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
                      <FaMoneyBillWave size={10} /> Payment
                    </button>
                    <button onClick={() => openAttachments(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                      <FaPaperclip size={10} /> Attachments
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══ Receive Modal ══ */}
      {receiveOpen && (
        <Modal title={`Receive Stock — ${activePo?.po_number}`} onClose={() => setReceiveOpen(false)} maxWidth="max-w-2xl">
          <div className="space-y-3">
            {receiveRows.map((r, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-slate-800">{r.item_name}</p>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">Balance: {r.remaining}</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Qty to Receive</label>
                  <input
                    type="number" min="0"
                    className={inputClass}
                    placeholder="0"
                    value={r.qty_received}
                    onChange={e => { const clone = [...receiveRows]; clone[idx] = { ...clone[idx], qty_received: e.target.value }; setReceiveRows(clone); }}
                  />
                </div>

                {Number(r.qty_received || 0) > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Batch No <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input className={inputClass} placeholder="Batch no" value={r.batch_no || ""} onChange={e => { const c = [...receiveRows]; c[idx] = { ...c[idx], batch_no: e.target.value }; setReceiveRows(c); }} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input type="date" className={inputClass} value={r.expiry_date || ""} onChange={e => { const c = [...receiveRows]; c[idx] = { ...c[idx], expiry_date: e.target.value }; setReceiveRows(c); }} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Serial Numbers <span className="text-slate-400 font-normal">(optional — one per line or comma)</span></label>
                      <textarea
                        rows={2}
                        className={`${inputClass} resize-none`}
                        placeholder={"SN001\nSN002"}
                        value={r.serial_numbers_text || ""}
                        onChange={e => { const c = [...receiveRows]; c[idx] = { ...c[idx], serial_numbers_text: e.target.value }; setReceiveRows(c); }}
                      />
                      {Boolean((r.serial_numbers_text || "").trim()) && (
                        <p className="text-[10px] text-slate-500">
                          {parseSerialNumbers(r.serial_numbers_text).length} entered / {Number(r.qty_received || 0)} required
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <ModalFooter
            onCancel={() => setReceiveOpen(false)}
            onConfirm={submitReceive}
            confirmLabel="Receive Stock"
          />
        </Modal>
      )}

      {/* ══ Payment Modal ══ */}
      {paymentOpen && (
        <Modal title={`Update Payment — ${activePo?.po_number}`} onClose={() => setPaymentOpen(false)} maxWidth="max-w-md">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Payment Status</label>
              <select className={inputClass} value={paymentForm.payment_status} onChange={e => setPaymentForm({ ...paymentForm, payment_status: e.target.value })}>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Paid Amount (₹)</label>
              <input type="number" className={inputClass} placeholder="0.00" value={paymentForm.paid_amount} onChange={e => setPaymentForm({ ...paymentForm, paid_amount: e.target.value })} />
            </div>
          </div>
          <ModalFooter onCancel={() => setPaymentOpen(false)} onConfirm={submitPayment} confirmLabel="Save Payment" />
        </Modal>
      )}

      {/* ══ Attachments Modal ══ */}
      {attachOpen && (
        <Modal
          title={`Attachments — ${activePo?.po_number}`}
          onClose={() => { setAttachOpen(false); setAttachments([]); setActivePo(null); }}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            {/* Upload */}
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <MdFileUpload size={20} className="text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Upload file</p>
                <p className="text-xs text-slate-400">PDF, JPG, PNG, XLSX accepted</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
                  disabled={attachUploading}
                  className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  onChange={async e => { const file = e.target.files?.[0]; if (file) await uploadAttachment(file); e.target.value = ""; }}
                />
                {attachUploading && <span className="text-xs text-slate-400 animate-pulse">Uploading…</span>}
              </div>
            </div>

            {/* List */}
            {attachments.length === 0 ? (
              <div className="text-center py-8">
                <FaPaperclip size={24} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No attachments yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map(a => (
                  <div key={a.attachment_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FaPaperclip size={12} className="text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{a.original_filename}</p>
                        {a.size_bytes && <p className="text-xs text-slate-400">{(a.size_bytes / 1024).toFixed(1)} KB</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {a.url && (
                        <a href={`${apiOrigin}${a.url}`} target="_blank" rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                          Open
                        </a>
                      )}
                      <button onClick={() => deleteAttachment(a.attachment_id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition flex items-center gap-1">
                        <FaTrash size={9} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <button onClick={() => { setAttachOpen(false); setAttachments([]); setActivePo(null); }}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Reusable helpers ── */

function AmountChip({ label, value, color = "slate" }) {
  const colors = {
    slate: "bg-slate-50 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className={`rounded-xl px-3 py-2 ${colors[color] || colors.slate}`}>
      <p className="text-[10px] font-medium opacity-70">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children, maxWidth = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
            <IoClose size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onConfirm, confirmLabel = "Confirm" }) {
  return (
    <div className="flex gap-2 mt-6">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
        Cancel
      </button>
      <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition" style={{ background: BLUE }}>
        {confirmLabel}
      </button>
    </div>
  );
}
