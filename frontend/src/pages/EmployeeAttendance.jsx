import { useEffect, useMemo, useState } from "react";
import api from "../utils/apiClient";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import BackButton from "../components/BackButton";

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];

export default function EmployeeAttendance() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [attendanceDate, setAttendanceDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [attendanceData, setAttendanceData] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get("/employees");
      const rows = res?.data || [];
      setEmployees(rows);

      const init = {};
      rows.forEach((emp) => {
        init[emp.employee_id] = {
          status: "PRESENT",
          worked_units: 1,
          wage: emp.daily_wage || 0,
        };
      });
      setAttendanceData(init);
    } catch {
      showToast("Failed to load employees", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    authAxios.get("/shop/details")
      .then(res => {
        const bDate = res.data?.app_date;
        setAttendanceDate(bDate || new Date().toISOString().slice(0, 10));
      })
      .catch(() => setAttendanceDate(new Date().toISOString().slice(0, 10)));
    loadEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) =>
      e.employee_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search]);

  const updateField = (id, field, value) => {
    setAttendanceData((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const payrollSummary = useMemo(() => {
    let present = 0,
      absent = 0,
      leave = 0,
      half = 0,
      totalPayroll = 0;

    Object.values(attendanceData).forEach((row) => {
      if (row.status === "PRESENT") present++;
      if (row.status === "ABSENT") absent++;
      if (row.status === "LEAVE") leave++;
      if (row.status === "HALF_DAY") half++;

      if (row.status !== "ABSENT") {
        totalPayroll += Number(row.wage || 0) * Number(row.worked_units || 1);
      }
    });

    return { present, absent, leave, half, totalPayroll };
  }, [attendanceData]);

  const submitAttendance = async () => {
    if (saving) return;

    setSaving(true);
    try {
      const requests = filteredEmployees.map((emp) => {
        const data = attendanceData[emp.employee_id];

        return api.post(`/employees/${emp.employee_id}/attendance`, {
          attendance_date: attendanceDate,
          status: data.status,
          worked_units: data.worked_units,
          wage_amount:
            data.status === "ABSENT"
              ? 0
              : Number(data.wage) * Number(data.worked_units),
        });
      });

      await Promise.all(requests);
      showToast("Payroll Attendance Submitted", "success");
    } catch {
      showToast("Submission failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition";
  const statusColor = { PRESENT: "text-emerald-600", ABSENT: "text-rose-600", HALF_DAY: "text-amber-600", LEAVE: "text-blue-600" };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Payroll Attendance</h1>
          <p className="text-[11px] text-gray-400">{filteredEmployees.length} employee{filteredEmployees.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className={inputCls}
          />
          <input
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-40`}
          />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Present", value: payrollSummary.present, color: "text-emerald-600" },
            { label: "Absent", value: payrollSummary.absent, color: "text-rose-600" },
            { label: "Half Day", value: payrollSummary.half, color: "text-amber-600" },
            { label: "Leave", value: payrollSummary.leave, color: "text-blue-600" },
            { label: "Total Payroll", value: `₹${payrollSummary.totalPayroll.toFixed(2)}`, color: "text-gray-800" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border rounded-2xl shadow-sm p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</div>
              <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Attendance table */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading employees...</div>
          ) : (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Employee</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Status</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Worked Units</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Daily Wage</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredEmployees.map((emp, idx) => {
                    const row = attendanceData[emp.employee_id];
                    const payable = row.status === "ABSENT" ? 0 : Number(row.wage) * Number(row.worked_units);
                    return (
                      <tr key={emp.employee_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-gray-800">{emp.employee_name}</div>
                          {emp.designation && <div className="text-[10px] text-gray-400">{emp.designation}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={row.status}
                            onChange={(e) => updateField(emp.employee_id, "status", e.target.value)}
                            className={`border border-gray-200 rounded-xl px-2 py-1 text-[11px] bg-gray-50 focus:outline-none ${statusColor[row.status] || ""}`}
                          >
                            {STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number" step="0.5"
                            value={row.worked_units}
                            onChange={(e) => updateField(emp.employee_id, "worked_units", e.target.value)}
                            className="border border-gray-200 rounded-xl px-2 py-1 w-20 text-[12px] bg-gray-50 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            value={row.wage}
                            onChange={(e) => updateField(emp.employee_id, "wage", e.target.value)}
                            className="border border-gray-200 rounded-xl px-2 py-1 w-24 text-[12px] bg-gray-50 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-800">₹{payable.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            onClick={submitAttendance}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60"
          >
            {saving ? "Processing..." : "Submit Payroll Attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}
