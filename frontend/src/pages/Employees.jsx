import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getBusinessDate, startOfBusinessMonth } from "../utils/businessDate";
import { addEmployeeDoc, listEmployeeDocs, removeEmployeeDoc } from "../utils/hrmsLocalStore";

const todayIso = () => getBusinessDate();
const firstDay = (isoDate) => startOfBusinessMonth(isoDate);

const WAGE_TYPES = ["DAILY", "MONTHLY", "ON_DEMAND"];
const PAYMENT_MODES = ["CASH", "UPI", "BANK", "CARD", "OTHER"];
const DOC_TYPES = ["ID_PROOF", "ADDRESS_PROOF", "CONTRACT", "OFFER_LETTER", "OTHER"];

const money = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

export default function Employees() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [asOfDate, setAsOfDate] = useState(todayIso());

  const [employees, setEmployees] = useState([]);
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("ACTIVE");
  const [wageSummary, setWageSummary] = useState({
    employee_count: 0,
    earned_till_as_of: 0,
    paid_till_as_of: 0,
    due_till_as_of: 0,
    rows: [],
  });
  const [loading, setLoading] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [employeeSummary, setEmployeeSummary] = useState(null);
  const [paymentRows, setPaymentRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docs, setDocs] = useState([]);
  const [docForm, setDocForm] = useState({
    doc_type: "ID_PROOF",
    doc_number: "",
    fileData: null,
    fileName: "",
  });

  const [employeeForm, setEmployeeForm] = useState({
    employee_code: "",
    employee_name: "",
    mobile: "",
    designation: "",
    wage_type: "DAILY",
    daily_wage: "",
    monthly_wage: "",
    join_date: todayIso(),
    notes: "",
    active: true,
  });
  const [editingId, setEditingId] = useState(null);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const xlsxRef = useRef(null);

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rows = raw.map(r => ({
        employee_name: String(r["employee_name"] || r["Employee Name"] || r["name"] || "").trim(),
        employee_code: String(r["employee_code"] || r["Code"] || r["code"] || "").trim() || undefined,
        mobile: String(r["mobile"] || r["Mobile"] || r["phone"] || "").trim() || undefined,
        designation: String(r["designation"] || r["Designation"] || r["role"] || "").trim() || undefined,
        wage_type: String(r["wage_type"] || r["Wage Type"] || "DAILY").trim().toUpperCase().replace(" ", "_") || "DAILY",
        daily_wage: parseFloat(r["daily_wage"] || r["Daily Wage"] || 0) || 0,
        monthly_wage: parseFloat(r["monthly_wage"] || r["Monthly Wage"] || 0) || 0,
        join_date: String(r["join_date"] || r["Join Date"] || r["joining_date"] || "").trim() || undefined,
        notes: String(r["notes"] || r["Notes"] || "").trim() || undefined,
        branch_name: String(r["branch_name"] || r["Branch"] || r["branch"] || "").trim() || undefined,
      })).filter(r => r.employee_name);
      if (!rows.length) return showToast("No valid rows found in file", "error");
      const res = await api.post("/employees/bulk-import", rows);
      const errs = res.data.errors || [];
      showToast(`Done — ${res.data.inserted} inserted, ${res.data.updated} updated${errs.length ? `, ${errs.length} errors` : ""}`, "success");
      if (errs.length) console.warn("Import errors:", errs);
      loadPage();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const [paymentForm, setPaymentForm] = useState({
    payment_date: todayIso(),
    amount: "",
    payment_mode: "CASH",
    notes: "",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [employeeActionLoading, setEmployeeActionLoading] = useState(false);
  const [confirmingEmployeeAction, setConfirmingEmployeeAction] = useState(null);
  const [docAddForm, setDocAddForm] = useState({
    doc_type: "ID_PROOF",
    doc_number: "",
    fileData: null,
    fileName: "",
    mime: "",
  });

  const dueMap = useMemo(() => {
    const map = {};
    for (const row of wageSummary?.rows || []) {
      map[row.employee_id] = row;
    }
    return map;
  }, [wageSummary]);

  const activeEmployeeCount = useMemo(
    () => employees.filter((emp) => Boolean(emp.active)).length,
    [employees]
  );

  const inactiveEmployeeCount = useMemo(
    () => employees.filter((emp) => !Boolean(emp.active)).length,
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    if (employeeStatusFilter === "INACTIVE") {
      return employees.filter((emp) => !Boolean(emp.active));
    }
    if (employeeStatusFilter === "ALL") {
      return employees;
    }
    return employees.filter((emp) => Boolean(emp.active));
  }, [employees, employeeStatusFilter]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => Number(e.employee_id) === Number(selectedEmployeeId)) || null,
    [employees, selectedEmployeeId]
  );

  const resolveBranchParam = () => {
    if (isAdmin) return Number(branchId || 0) || undefined;
    return undefined;
  };

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/branch/active");
      setBranches(res?.data || []);
    } catch {
      setBranches([]);
    }
  };

  const loadEmployees = async () => {
    const res = await api.get("/employees", {
      params: { branch_id: resolveBranchParam(), include_inactive: true },
    });
    const rows = res?.data || [];
    setEmployees(rows);
    if (!selectedEmployeeId && rows.length > 0) {
      setSelectedEmployeeId(rows[0].employee_id);
    }
    if (selectedEmployeeId && !rows.some((x) => Number(x.employee_id) === Number(selectedEmployeeId))) {
      setSelectedEmployeeId(rows[0]?.employee_id || null);
    }
  };

  const loadWageSummary = async () => {
    const res = await api.get("/employees/wages/summary", {
      params: {
        branch_id: resolveBranchParam(),
        as_of_date: asOfDate,
      },
    });
    setWageSummary(
      res?.data || {
        employee_count: 0,
        earned_till_as_of: 0,
        paid_till_as_of: 0,
        due_till_as_of: 0,
        rows: [],
      }
    );
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      await Promise.all([loadEmployees(), loadWageSummary()]);
    } catch {
      showToast("Failed to load employee management data", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedEmployeeDetails = async (employeeId) => {
    if (!employeeId) {
      setEmployeeSummary(null);
      setPaymentRows([]);
      return;
    }

    setDetailLoading(true);
    try {
      const fromDate = firstDay(asOfDate);
      const [summaryRes, payRes] = await Promise.all([
        api.get(`/employees/${employeeId}/wage-summary`, {
          params: { from_date: fromDate, to_date: asOfDate, as_of_date: asOfDate },
        }),
        api.get(`/employees/${employeeId}/payments`, {
          params: { limit: 120 },
        }),
      ]);
      setEmployeeSummary(summaryRes?.data || null);
      setPaymentRows(payRes?.data || []);
    } catch {
      setEmployeeSummary(null);
      setPaymentRows([]);
      showToast("Failed to load employee details", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadPage();
  }, [branchId, asOfDate]);

  useEffect(() => {
    loadSelectedEmployeeDetails(selectedEmployeeId);
    setDocs(listEmployeeDocs(selectedEmployeeId));
  }, [selectedEmployeeId, asOfDate]);

  const resetEmployeeForm = () => {
    setEmployeeForm({
      employee_code: "",
      employee_name: "",
      mobile: "",
      designation: "",
      wage_type: "DAILY",
      daily_wage: "",
      monthly_wage: "",
      join_date: todayIso(),
      notes: "",
      active: true,
    });
    setEditingId(null);
    setDocAddForm({
      doc_type: "ID_PROOF",
      doc_number: "",
      fileData: null,
      fileName: "",
      mime: "",
    });
  };

  const saveEmployee = async () => {
    if (employeeSaving) return;
    if (!employeeForm.employee_name.trim()) {
      showToast("Employee name is required", "error");
      return;
    }

    const wageType = String(employeeForm.wage_type || "DAILY").toUpperCase();
    if (wageType === "DAILY" && Number(employeeForm.daily_wage || 0) <= 0) {
      showToast("Daily wage must be greater than 0", "error");
      return;
    }
    if (wageType === "MONTHLY" && Number(employeeForm.monthly_wage || 0) <= 0) {
      showToast("Monthly wage must be greater than 0", "error");
      return;
    }

    const payload = {
      employee_code: employeeForm.employee_code?.trim() || null,
      employee_name: employeeForm.employee_name?.trim(),
      mobile: employeeForm.mobile?.trim() || null,
      designation: employeeForm.designation?.trim() || null,
      wage_type: wageType,
      daily_wage: Number(employeeForm.daily_wage || 0),
      monthly_wage: Number(employeeForm.monthly_wage || 0),
      join_date: employeeForm.join_date || null,
      notes: employeeForm.notes?.trim() || null,
      active: Boolean(employeeForm.active),
      branch_id: resolveBranchParam(),
    };

    setEmployeeSaving(true);
    try {
      if (editingId) {
        await api.put(`/employees/${editingId}`, payload);
        showToast("Employee updated", "success");
      } else {
        const res = await api.post("/employees", payload);
        const newId =
          res?.data?.employee_id ||
          res?.data?.id ||
          res?.data?.employee?.employee_id ||
          null;
        showToast("Employee created", "success");
        if (newId && docAddForm.fileData) {
          addEmployeeDoc(newId, {
            doc_type: docAddForm.doc_type,
            doc_number: docAddForm.doc_number.trim(),
            name: docAddForm.fileName,
            type: docAddForm.mime,
            data: docAddForm.fileData,
          });
          setSelectedEmployeeId(newId);
          setDocs(listEmployeeDocs(newId));
          setDocAddForm({
            doc_type: "ID_PROOF",
            doc_number: "",
            fileData: null,
            fileName: "",
            mime: "",
          });
        }
      }
      resetEmployeeForm();
      await loadPage();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to save employee", "error");
    } finally {
      setEmployeeSaving(false);
    }
  };

  const editEmployee = (emp) => {
    setEditingId(emp.employee_id);
    setEmployeeForm({
      employee_code: emp.employee_code || "",
      employee_name: emp.employee_name || "",
      mobile: emp.mobile || "",
      designation: emp.designation || "",
      wage_type: emp.wage_type || "DAILY",
      daily_wage: Number(emp.daily_wage || 0),
      monthly_wage: Number(emp.monthly_wage || 0),
      join_date: emp.join_date || todayIso(),
      notes: emp.notes || "",
      active: Boolean(emp.active),
    });
  };

  const openEmployeeActionConfirm = (emp, action) => {
    setConfirmingEmployeeAction({
      action,
      employee_id: emp.employee_id,
      employee_name: emp.employee_name,
      designation: emp.designation || "",
      wage_type: emp.wage_type || "",
      due_till_as_of: Number(dueMap?.[emp.employee_id]?.due_till_as_of || 0),
    });
  };

  const closeEmployeeActionConfirm = () => {
    const actionLabel =
      confirmingEmployeeAction?.action === "restore" ? "Restore" : "Deactivate";
    setConfirmingEmployeeAction(null);
    showToast(`${actionLabel} cancelled`, "warning");
  };

  const confirmEmployeeAction = async () => {
    if (!confirmingEmployeeAction?.employee_id || employeeActionLoading) return;

    const { action, employee_id: employeeId } = confirmingEmployeeAction;
    setEmployeeActionLoading(true);
    try {
      if (action === "restore") {
        await api.post(`/employees/${employeeId}/restore`);
        showToast("Employee restored", "success");
        setSelectedEmployeeId(employeeId);
      } else {
        await api.delete(`/employees/${employeeId}`);
        showToast("Employee deactivated", "success");
      }

      setConfirmingEmployeeAction(null);
      await loadPage();
    } catch (err) {
      showToast(
        err?.response?.data?.detail ||
          (action === "restore"
            ? "Failed to restore employee"
            : "Failed to deactivate employee"),
        "error"
      );
    } finally {
      setEmployeeActionLoading(false);
    }
  };

  const savePayment = async () => {
    if (!selectedEmployeeId || paymentSaving) return;
    if (Number(paymentForm.amount || 0) <= 0) {
      showToast("Payment amount must be greater than 0", "error");
      return;
    }
    setPaymentSaving(true);
    try {
      await api.post(`/employees/${selectedEmployeeId}/payments`, {
        payment_date: paymentForm.payment_date || asOfDate,
        amount: Number(paymentForm.amount),
        payment_mode: paymentForm.payment_mode,
        notes: paymentForm.notes?.trim() || null,
      });
      showToast("Payment saved", "success");
      await Promise.all([loadSelectedEmployeeDetails(selectedEmployeeId), loadWageSummary()]);
      setPaymentForm((prev) => ({ ...prev, amount: "", notes: "" }));
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to save payment", "error");
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDocFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setDocForm((p) => ({ ...p, fileData: null, fileName: "", mime: "" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDocForm((p) => ({
        ...p,
        fileData: reader.result,
        fileName: file.name,
        mime: file.type || "application/octet-stream",
      }));
    reader.readAsDataURL(file);
  };

  const saveDocument = () => {
    if (!selectedEmployeeId) {
      showToast("Select an employee first", "error");
      return;
    }
    if (!docForm.doc_number.trim()) {
      showToast("Doc number is required", "error");
      return;
    }
    if (!docForm.fileData) {
      showToast("Attach a document file", "error");
      return;
    }
    const updated = addEmployeeDoc(selectedEmployeeId, {
      doc_type: docForm.doc_type,
      doc_number: docForm.doc_number.trim(),
      name: docForm.fileName,
      type: docForm.mime,
      data: docForm.fileData,
    });
    setDocs(updated);
    setDocForm({
      doc_type: "ID_PROOF",
      doc_number: "",
      fileData: null,
      fileName: "",
      mime: "",
    });
    showToast("Document saved (local)", "success");
  };

  const removeDoc = (id) => {
    setDocs(removeEmployeeDoc(selectedEmployeeId, id));
    showToast("Document removed", "info");
  };

  const handleDocAddFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setDocAddForm((p) => ({ ...p, fileData: null, fileName: "", mime: "" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDocAddForm((p) => ({
        ...p,
        fileData: reader.result,
        fileName: file.name,
        mime: file.type || "application/octet-stream",
      }));
    reader.readAsDataURL(file);
  };

  const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Employee Management</h1>
          <p className="text-[11px] text-gray-400">
            {activeEmployeeCount} active • {inactiveEmployeeCount} inactive
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          <button
            onClick={() => xlsxRef.current?.click()}
            disabled={importing}
            className="px-3 py-1.5 rounded-xl border text-[12px] font-medium text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition disabled:opacity-60"
          >
            {importing ? "Importing…" : "📥 Import Excel"}
          </button>
          <button
            onClick={() => navigate("/employees/attendance")}
            className="px-3 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Attendance
          </button>
          <button
            onClick={loadPage}
            className="px-3 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">

      {/* Filters + KPIs */}
      <div className="flex flex-wrap gap-3 items-end">
        {isAdmin && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Branch</label>
            <select className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
              {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-500 font-medium">As Of Date</label>
          <input type="date" className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Active Employees" value={activeEmployeeCount} />
        <KpiCard title="Total Due" value={money(wageSummary.due_till_as_of)} danger />
        <KpiCard title="Total Earned" value={money(wageSummary.earned_till_as_of)} />
        <KpiCard title="Total Paid" value={money(wageSummary.paid_till_as_of)} />
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Add / Edit Employee */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="text-sm font-bold text-gray-800">{editingId ? "Edit Employee" : "Add Employee"}</div>
          </div>
          <div className="p-4 space-y-2">
            <input className={inputCls} placeholder="Employee Code" value={employeeForm.employee_code} onChange={(e) => setEmployeeForm((p) => ({ ...p, employee_code: e.target.value }))} />
            <input className={inputCls} placeholder="Employee Name *" value={employeeForm.employee_name} onChange={(e) => setEmployeeForm((p) => ({ ...p, employee_name: e.target.value }))} />
            <input className={inputCls} placeholder="Mobile" value={employeeForm.mobile} onChange={(e) => setEmployeeForm((p) => ({ ...p, mobile: e.target.value }))} />
            <input className={inputCls} placeholder="Designation" value={employeeForm.designation} onChange={(e) => setEmployeeForm((p) => ({ ...p, designation: e.target.value }))} />
            <select className={inputCls} value={employeeForm.wage_type} onChange={(e) => setEmployeeForm((p) => ({ ...p, wage_type: e.target.value }))}>
              {WAGE_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" className={inputCls} placeholder="Daily Wage" value={employeeForm.daily_wage} onChange={(e) => setEmployeeForm((p) => ({ ...p, daily_wage: e.target.value }))} />
              <input type="number" className={inputCls} placeholder="Monthly Wage" value={employeeForm.monthly_wage} onChange={(e) => setEmployeeForm((p) => ({ ...p, monthly_wage: e.target.value }))} />
            </div>
            <input type="date" className={inputCls} value={employeeForm.join_date || ""} onChange={(e) => setEmployeeForm((p) => ({ ...p, join_date: e.target.value }))} />
            <textarea className={inputCls} rows={2} placeholder="Notes" value={employeeForm.notes} onChange={(e) => setEmployeeForm((p) => ({ ...p, notes: e.target.value }))} />
            <label className="flex items-center gap-2 text-[12px] text-gray-600">
              <input type="checkbox" checked={Boolean(employeeForm.active)} onChange={(e) => setEmployeeForm((p) => ({ ...p, active: e.target.checked }))} />
              Active
            </label>
            <div className="border-t pt-2 space-y-2">
              <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Onboarding Document (optional)</div>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={docAddForm.doc_type} onChange={(e) => setDocAddForm((p) => ({ ...p, doc_type: e.target.value }))}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className={inputCls} placeholder="Doc number" value={docAddForm.doc_number} onChange={(e) => setDocAddForm((p) => ({ ...p, doc_number: e.target.value }))} />
              </div>
              <input type="file" onChange={handleDocAddFile} className="text-[12px] text-gray-600" />
              {docAddForm.fileName && <div className="text-[11px] text-gray-500">Selected: {docAddForm.fileName}</div>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {editingId && (
                <button onClick={resetEmployeeForm} className="px-3 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              )}
              <button onClick={saveEmployee} disabled={employeeSaving} className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60">
                {employeeSaving ? "Saving..." : editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Employee List */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-gray-800">Employee List</div>
                <div className="text-[11px] text-gray-500">
                  {filteredEmployees.length} shown
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-xl border bg-white p-1">
                {[
                  { key: "ACTIVE", label: `Active (${activeEmployeeCount})` },
                  { key: "INACTIVE", label: `Inactive (${inactiveEmployeeCount})` },
                  { key: "ALL", label: `All (${employees.length})` },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setEmployeeStatusFilter(option.key)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      employeeStatusFilter === option.key
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-3 max-h-[480px] overflow-auto space-y-1.5">
            {loading ? (
              <div className="text-[12px] text-gray-400 text-center py-8">Loading...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-[12px] text-gray-400 text-center py-8">No employees found</div>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = Number(selectedEmployeeId) === Number(emp.employee_id);
                const due = dueMap?.[emp.employee_id]?.due_till_as_of || 0;
                return (
                  <div
                    key={emp.employee_id}
                    className={`border rounded-xl p-3 text-[12px] cursor-pointer transition ${
                      isSelected
                        ? "bg-blue-50 border-blue-200"
                        : emp.active
                          ? "bg-white hover:bg-gray-50"
                          : "bg-slate-50/80 border-slate-200 hover:bg-slate-100/70"
                    }`}
                    onClick={() => setSelectedEmployeeId(emp.employee_id)}
                  >
                    <div className="flex justify-between gap-2">
                      <div className="space-y-1">
                        <div className="font-semibold text-gray-800">{emp.employee_name}</div>
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            emp.active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}>
                            {emp.active ? "Active" : "Inactive"}
                          </span>
                          {!emp.active && (
                            <span className="text-[10px] text-slate-500">Restore available</span>
                          )}
                        </div>
                      </div>
                      <div className={`font-semibold ${Number(due) > 0 ? "text-rose-600" : Number(due) < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {money(due)}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {emp.wage_type} | {emp.designation || "No role"} | {emp.mobile || "-"}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); editEmployee(emp); }} className="px-2.5 py-0.5 border rounded-lg text-[11px] font-medium text-gray-600 hover:bg-gray-100 transition">Edit</button>
                      {emp.active && (
                        <button onClick={(e) => { e.stopPropagation(); openEmployeeActionConfirm(emp, "deactivate"); }} className="px-2.5 py-0.5 border rounded-lg text-[11px] font-medium text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition">Deactivate</button>
                      )}
                      {!emp.active && (
                        <button onClick={(e) => { e.stopPropagation(); openEmployeeActionConfirm(emp, "restore"); }} className="px-2.5 py-0.5 border rounded-lg text-[11px] font-medium text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition">Restore</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Wage Due List */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="text-sm font-bold text-gray-800">Wage Due List</div>
          </div>
          <div className="p-3 max-h-[480px] overflow-auto space-y-1.5">
            {(wageSummary?.rows || []).length === 0 ? (
              <div className="text-[12px] text-gray-400 text-center py-8">No wage data</div>
            ) : (
              wageSummary.rows.slice().sort((a, b) => Number(b.due_till_as_of || 0) - Number(a.due_till_as_of || 0)).map((row) => (
                <div key={row.employee_id} className="border rounded-xl p-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-800">{row.employee_name}</span>
                    <span className={`font-semibold ${Number(row.due_till_as_of || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(row.due_till_as_of)}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Earned: {money(row.earned_till_as_of)} | Paid: {money(row.paid_till_as_of)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Wage Settlement */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="text-sm font-bold text-gray-800">
            Wage Settlement {selectedEmployee ? `- ${selectedEmployee.employee_name}` : ""}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {employeeSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <SummaryTag label="Period Earned" value={money(employeeSummary.earned_amount)} />
              <SummaryTag label="Period Paid" value={money(employeeSummary.paid_amount)} />
              <SummaryTag label="Period Due" value={money(employeeSummary.due_amount)} danger />
              <SummaryTag label="Total Due" value={money(employeeSummary.due_till_as_of)} danger />
            </div>
          )}
          {selectedEmployee && !selectedEmployee.active && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              This employee is inactive. Restore the employee from the list before adding new settlement payments.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input type="date" className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" value={paymentForm.payment_date} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))} />
            <input type="number" className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} />
            <select className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none" value={paymentForm.payment_mode} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_mode: e.target.value }))}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <button onClick={savePayment} disabled={!selectedEmployee || !selectedEmployee.active || paymentSaving} className="px-5 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60">
            {paymentSaving ? "Saving..." : "Save Payment"}
          </button>
          <div className="bg-white border rounded-xl overflow-auto max-h-[220px]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Mode</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detailLoading ? (
                  <tr><td className="px-3 py-3 text-gray-400 text-[12px]" colSpan={3}>Loading...</td></tr>
                ) : paymentRows.length === 0 ? (
                  <tr><td className="px-3 py-3 text-gray-400 text-[12px]" colSpan={3}>No payments yet</td></tr>
                ) : (
                  paymentRows.map((row) => (
                    <tr key={row.payment_id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-600">{row.payment_date}</td>
                      <td className="px-3 py-2 text-gray-600">{row.payment_mode}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{money(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="text-sm font-bold text-gray-800">
            Documents {selectedEmployee ? `- ${selectedEmployee.employee_name}` : ""}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {!selectedEmployee ? (
            <div className="text-[12px] text-gray-400">Select an employee to manage documents.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none" value={docForm.doc_type} onChange={(e) => setDocForm((p) => ({ ...p, doc_type: e.target.value }))}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Doc number" value={docForm.doc_number} onChange={(e) => setDocForm((p) => ({ ...p, doc_number: e.target.value }))} />
                <input type="file" onChange={handleDocFile} className="text-[12px] text-gray-600" />
                <button onClick={saveDocument} className="px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition">Save Document</button>
              </div>
              {docForm.fileName && <div className="text-[11px] text-gray-500">Selected: {docForm.fileName}</div>}
              <div className="bg-white border rounded-xl overflow-auto max-h-[220px]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {["Type", "Doc #", "File", "Actions"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {docs.length === 0 ? (
                      <tr><td className="px-3 py-3 text-gray-400" colSpan={4}>No documents yet</td></tr>
                    ) : (
                      docs.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-600">{d.doc_type}</td>
                          <td className="px-3 py-2 text-gray-600">{d.doc_number}</td>
                          <td className="px-3 py-2"><a className="text-blue-600 hover:underline" href={d.data} target="_blank" rel="noreferrer">{d.name || "View"}</a></td>
                          <td className="px-3 py-2 text-right"><button className="px-2.5 py-0.5 border rounded-lg text-[11px] text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition" onClick={() => removeDoc(d.id)}>Remove</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmingEmployeeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-white shadow-xl">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">
                {confirmingEmployeeAction.action === "restore"
                  ? "Restore Employee"
                  : "Deactivate Employee"}
              </h2>
              <p className="mt-1 text-[12px] text-gray-500">
                {confirmingEmployeeAction.action === "restore"
                  ? `Restore ${confirmingEmployeeAction.employee_name}?`
                  : `Deactivate ${confirmingEmployeeAction.employee_name}?`}
              </p>
            </div>

            <div className="space-y-1 px-5 py-4 text-[12px] text-gray-600">
              <div>
                <span className="font-medium text-gray-700">Wage Type:</span>{" "}
                {confirmingEmployeeAction.wage_type || "NA"}
              </div>
              <div>
                <span className="font-medium text-gray-700">Role:</span>{" "}
                {confirmingEmployeeAction.designation || "NA"}
              </div>
              <div>
                <span className="font-medium text-gray-700">Settlement:</span>{" "}
                {confirmingEmployeeAction.due_till_as_of > 0
                  ? `Payable ${money(confirmingEmployeeAction.due_till_as_of)}`
                  : confirmingEmployeeAction.due_till_as_of < 0
                    ? `Receivable ${money(Math.abs(confirmingEmployeeAction.due_till_as_of))}`
                    : "Settled"}
              </div>
              {confirmingEmployeeAction.action === "deactivate" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Deactivation is allowed only after all payable or receivable amounts are settled.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t bg-gray-50 px-5 py-3">
              <button
                type="button"
                disabled={employeeActionLoading}
                onClick={closeEmployeeActionConfirm}
                className="rounded-lg border bg-white px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={employeeActionLoading}
                onClick={confirmEmployeeAction}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
                  confirmingEmployeeAction.action === "restore"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {employeeActionLoading
                  ? confirmingEmployeeAction.action === "restore"
                    ? "Restoring..."
                    : "Deactivating..."
                  : confirmingEmployeeAction.action === "restore"
                    ? "Confirm Restore"
                    : "Confirm Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}

function KpiCard({ title, value, danger = false }) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{title}</div>
      <div className={`text-lg font-bold mt-1 ${danger ? "text-rose-600" : "text-gray-800"}`}>
        {value}
      </div>
    </div>
  );
}

function SummaryTag({ label, value, danger = false }) {
  return (
    <div className={`rounded-lg border px-2 py-1 ${danger ? "bg-rose-50 border-rose-200" : "bg-gray-50"}`}>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-[12px] font-semibold ${danger ? "text-rose-600" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}
