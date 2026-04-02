import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { addEmployeeDoc, listEmployeeDocs, removeEmployeeDoc } from "../utils/hrmsLocalStore";

const todayIso = () => new Date().toISOString().slice(0, 10);
const firstDay = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

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

  const [paymentForm, setPaymentForm] = useState({
    payment_date: todayIso(),
    amount: "",
    payment_mode: "CASH",
    notes: "",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
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
      params: { branch_id: resolveBranchParam() },
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

  const deactivateEmployee = async (emp) => {
    const ok = window.confirm(`Deactivate ${emp.employee_name}?`);
    if (!ok) return;
    try {
      await api.delete(`/employees/${emp.employee_id}`);
      showToast("Employee deactivated", "success");
      await loadPage();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to deactivate employee", "error");
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
          <p className="text-[11px] text-gray-400">{wageSummary.employee_count} employee{wageSummary.employee_count !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
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
        <KpiCard title="Employees" value={wageSummary.employee_count} />
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
            <div className="text-sm font-bold text-gray-800">Employee List</div>
          </div>
          <div className="p-3 max-h-[480px] overflow-auto space-y-1.5">
            {loading ? (
              <div className="text-[12px] text-gray-400 text-center py-8">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="text-[12px] text-gray-400 text-center py-8">No employees found</div>
            ) : (
              employees.map((emp) => {
                const isSelected = Number(selectedEmployeeId) === Number(emp.employee_id);
                const due = dueMap?.[emp.employee_id]?.due_till_as_of || 0;
                return (
                  <div
                    key={emp.employee_id}
                    className={`border rounded-xl p-3 text-[12px] cursor-pointer transition ${isSelected ? "bg-blue-50 border-blue-200" : "bg-white hover:bg-gray-50"}`}
                    onClick={() => setSelectedEmployeeId(emp.employee_id)}
                  >
                    <div className="flex justify-between gap-2">
                      <div className="font-semibold text-gray-800">{emp.employee_name}</div>
                      <div className={`font-semibold ${Number(due) > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(due)}</div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {emp.wage_type} | {emp.designation || "No role"} | {emp.mobile || "-"}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); editEmployee(emp); }} className="px-2.5 py-0.5 border rounded-lg text-[11px] font-medium text-gray-600 hover:bg-gray-100 transition">Edit</button>
                      {emp.active && (
                        <button onClick={(e) => { e.stopPropagation(); deactivateEmployee(emp); }} className="px-2.5 py-0.5 border rounded-lg text-[11px] font-medium text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition">Deactivate</button>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input type="date" className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" value={paymentForm.payment_date} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))} />
            <input type="number" className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} />
            <select className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none" value={paymentForm.payment_mode} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_mode: e.target.value }))}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <button onClick={savePayment} disabled={!selectedEmployee || paymentSaving} className="px-5 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60">
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
    </div>
    </div>
  );
}

function KpiCard({ title, value, danger = false }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] text-slate-500">{title}</div>
      <div className={`text-lg font-semibold ${danger ? "text-rose-600" : "text-slate-800"}`}>
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
