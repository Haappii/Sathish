import { useEffect, useMemo, useState } from "react";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import BackButton from "../components/BackButton";

const todayIso = () => new Date().toISOString().slice(0, 10);
const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];

export default function EmployeeAttendance() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [attendanceDate, setAttendanceDate] = useState(todayIso());
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BackButton />
          <h2 className="text-lg font-bold text-slate-800">Attendance</h2>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border bg-white text-[12px]"
          />

          <input
            placeholder="Search Employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg border bg-white text-[12px]"
          />
        </div>
      </div>

      {/* Summary Panel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Present", payrollSummary.present],
          ["Absent", payrollSummary.absent],
          ["Half Day", payrollSummary.half],
          ["Leave", payrollSummary.leave],
          ["Total Payroll", `Rs. ${payrollSummary.totalPayroll.toFixed(2)}`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border bg-white p-3"
          >
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">
              {label}
            </div>
            <div className="text-lg font-semibold text-slate-800 mt-1">{value}</div>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-500 text-sm">Loading employees...</div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 sticky top-0 z-10 text-slate-800">
                <tr>
                  <th className="p-3 text-left font-semibold">Employee</th>
                  <th className="p-3 text-left font-semibold">Status</th>
                  <th className="p-3 text-left font-semibold">Worked Units</th>
                  <th className="p-3 text-left font-semibold">Daily Wage</th>
                  <th className="p-3 text-right font-semibold">Payable</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, idx) => {
                  const row = attendanceData[emp.employee_id];
                  const stripe = idx % 2 === 0 ? "bg-white" : "bg-slate-50";

                  return (
                    <tr key={emp.employee_id} className={`${stripe} border-t`}>
                      <td className="p-3 font-semibold text-slate-800">
                        {emp.employee_name}
                      </td>

                      <td className="p-3">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateField(emp.employee_id, "status", e.target.value)
                          }
                          className="border rounded-lg px-2 py-1 text-[12px] bg-white"
                        >
                          {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <input
                          type="number"
                          step="0.5"
                          value={row.worked_units}
                          onChange={(e) =>
                            updateField(
                              emp.employee_id,
                              "worked_units",
                              e.target.value
                            )
                          }
                          className="border rounded-lg px-2 py-1 w-20 text-[12px] bg-white"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="number"
                          value={row.wage}
                          onChange={(e) =>
                            updateField(emp.employee_id, "wage", e.target.value)
                          }
                          className="border rounded-lg px-2 py-1 w-24 text-[12px] bg-white"
                        />
                      </td>

                      <td className="p-3 text-right font-semibold text-slate-800">
                        Rs.{" "}
                        {(
                          row.status === "ABSENT"
                            ? 0
                            : Number(row.wage) * Number(row.worked_units)
                        ).toFixed(2)}
                      </td>
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
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
        >
          {saving ? "Processing Payroll..." : "Submit Payroll Attendance"}
        </button>
      </div>
    </div>
  );
}
