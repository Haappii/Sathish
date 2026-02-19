import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import BackButton from "../components/BackButton";

const todayIso = () => new Date().toISOString().slice(0, 10);
const firstDay = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const ATT_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];
const money = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

export default function EmployeeAttendance() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [asOfDate, setAsOfDate] = useState(todayIso());

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [attendanceRows, setAttendanceRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [attendanceForm, setAttendanceForm] = useState({
    attendance_date: todayIso(),
    status: "PRESENT",
    worked_units: "1",
    wage_amount: "",
    notes: "",
  });

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

  const loadAttendance = async (employeeId) => {
    if (!employeeId) {
      setAttendanceRows([]);
      return;
    }

    setDetailLoading(true);
    try {
      const fromDate = firstDay(asOfDate);
      const res = await api.get(`/employees/${employeeId}/attendance`, {
        params: { from_date: fromDate, to_date: asOfDate, limit: 200 },
      });
      setAttendanceRows(res?.data || []);
    } catch {
      setAttendanceRows([]);
      showToast("Failed to load attendance", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      await loadEmployees();
    } catch {
      showToast("Failed to load employee list", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadPage();
  }, [branchId]);

  useEffect(() => {
    loadAttendance(selectedEmployeeId);
  }, [selectedEmployeeId, asOfDate]);

  const saveAttendance = async () => {
    if (!selectedEmployeeId || attendanceSaving) return;

    setAttendanceSaving(true);
    try {
      await api.post(`/employees/${selectedEmployeeId}/attendance`, {
        attendance_date: attendanceForm.attendance_date || asOfDate,
        status: attendanceForm.status,
        worked_units: Number(attendanceForm.worked_units || 1),
        wage_amount:
          attendanceForm.wage_amount === "" || attendanceForm.wage_amount === null
            ? null
            : Number(attendanceForm.wage_amount),
        notes: attendanceForm.notes?.trim() || null,
      });

      showToast("Attendance saved", "success");
      setAttendanceForm((prev) => ({ ...prev, wage_amount: "", notes: "" }));
      await loadAttendance(selectedEmployeeId);
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to save attendance", "error");
    } finally {
      setAttendanceSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackButton />
          <h2 className="text-lg font-bold text-slate-800">Employee Attendance</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/employees")}
            className="px-3 py-1.5 rounded-lg border bg-white text-[12px]"
          >
            Employee Management
          </button>
          <button
            onClick={loadPage}
            className="px-3 py-1.5 rounded-lg border bg-white text-[12px]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {isAdmin && (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-[11px] text-slate-500 mb-1">Branch</div>
            <select
              className="w-full border rounded-lg px-2 py-1.5 text-[12px]"
              value={branchId}
              onChange={(e) => setBranchId(Number(e.target.value))}
            >
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-xl border bg-white p-3">
          <div className="text-[11px] text-slate-500 mb-1">As Of Date</div>
          <input
            type="date"
            className="w-full border rounded-lg px-2 py-1.5 text-[12px]"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-[11px] text-slate-500 mb-1">Employees</div>
          <div className="text-lg font-semibold text-slate-800">{employees.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Employee List</div>
          <div className="max-h-[520px] overflow-auto space-y-2">
            {loading ? (
              <div className="text-[12px] text-slate-500">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="text-[12px] text-slate-500">No employees found</div>
            ) : (
              employees.map((emp) => {
                const isSelected = Number(selectedEmployeeId) === Number(emp.employee_id);
                return (
                  <button
                    key={emp.employee_id}
                    type="button"
                    className={`w-full text-left border rounded-lg p-2 text-[12px] ${isSelected ? "bg-indigo-50 border-indigo-300" : "bg-white"}`}
                    onClick={() => setSelectedEmployeeId(emp.employee_id)}
                  >
                    <div className="font-semibold">{emp.employee_name}</div>
                    <div className="text-slate-500">
                      {emp.wage_type} | {emp.designation || "No role"} | {emp.mobile || "-"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">
            Attendance {selectedEmployee ? `- ${selectedEmployee.employee_name}` : ""}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="date"
              className="border rounded-lg px-2 py-1.5 text-[12px]"
              value={attendanceForm.attendance_date}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, attendance_date: e.target.value }))}
            />
            <select
              className="border rounded-lg px-2 py-1.5 text-[12px]"
              value={attendanceForm.status}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, status: e.target.value }))}
            >
              {ATT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              className="border rounded-lg px-2 py-1.5 text-[12px]"
              placeholder="Worked Units (0-1)"
              value={attendanceForm.worked_units}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, worked_units: e.target.value }))}
            />
            <input
              type="number"
              className="border rounded-lg px-2 py-1.5 text-[12px]"
              placeholder="Wage Override (optional)"
              value={attendanceForm.wage_amount}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, wage_amount: e.target.value }))}
            />
            <input
              className="border rounded-lg px-2 py-1.5 text-[12px] md:col-span-2"
              placeholder="Notes"
              value={attendanceForm.notes}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <button
            onClick={saveAttendance}
            disabled={!selectedEmployee || attendanceSaving}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] disabled:opacity-60"
          >
            {attendanceSaving ? "Saving..." : "Save Attendance"}
          </button>

          <div className="border rounded-lg overflow-auto max-h-[340px]">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Wage</th>
                </tr>
              </thead>
              <tbody>
                {detailLoading ? (
                  <tr>
                    <td className="p-2 text-slate-500" colSpan={3}>Loading...</td>
                  </tr>
                ) : attendanceRows.length === 0 ? (
                  <tr>
                    <td className="p-2 text-slate-500" colSpan={3}>No attendance records</td>
                  </tr>
                ) : (
                  attendanceRows.map((row) => (
                    <tr key={row.attendance_id} className="border-t">
                      <td className="p-2">{row.attendance_date}</td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 text-right">{money(row.wage_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
