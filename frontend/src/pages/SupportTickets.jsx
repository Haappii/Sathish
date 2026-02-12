import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

const statusOptions = ["OPEN", "IN_PROGRESS", "CLOSED"];

export default function SupportTickets() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [ticketType, setTicketType] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(200);

  const [expandedId, setExpandedId] = useState(null);

  const expandedTicket = useMemo(
    () => rows.find(r => Number(r.ticket_id) === Number(expandedId)) || null,
    [rows, expandedId]
  );

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        limit: Number(limit || 200)
      };
      if (ticketType) params.ticket_type = ticketType;
      if (status) params.status = status;

      const res = await authAxios.get("/support/tickets", { params });
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load tickets";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const setTicketStatus = async (ticketId, newStatus) => {
    try {
      await authAxios.post(`/support/tickets/${ticketId}/status`, null, {
        params: { new_status: newStatus }
      });
      showToast("Status updated", "success");
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Update failed";
      showToast(msg, "error");
    }
  };

  const downloadAttachment = async (t) => {
    if (!t?.ticket_id) return;
    try {
      const res = await authAxios.get(`/support/tickets/${t.ticket_id}/attachment`, {
        responseType: "blob"
      });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = t.attachment_filename || `ticket_${t.ticket_id}_attachment`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Download failed";
      showToast(msg, "error");
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  if (!isAdmin) {
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
          onClick={() => navigate("/home", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Support Tickets</div>
        <div />
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[160px]">
            <label className="text-[10px] text-gray-600">Type</label>
            <select
              className="w-full border rounded-lg px-2 py-1"
              value={ticketType}
              onChange={e => setTicketType(e.target.value)}
            >
              <option value="">All</option>
              <option value="SUPPORT">SUPPORT</option>
              <option value="DEMO">DEMO</option>
            </select>
          </div>

          <div className="min-w-[160px]">
            <label className="text-[10px] text-gray-600">Status</label>
            <select
              className="w-full border rounded-lg px-2 py-1"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="">All</option>
              {statusOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[120px]">
            <label className="text-[10px] text-gray-600">Limit</label>
            <input
              type="number"
              className="w-full border rounded-lg px-2 py-1"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              min="1"
              max="500"
            />
          </div>

          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg overflow-x-auto">
          {loading ? (
            <div className="p-3 text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-gray-500">No tickets</div>
          ) : (
            <table className="min-w-[950px] w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Shop / Branch</th>
                  <th className="p-2">Contact</th>
                  <th className="p-2">Attachment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => (
                  <tr
                    key={t.ticket_id}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(t.ticket_id)}
                  >
                    <td className="p-2 font-semibold">{t.ticket_id}</td>
                    <td className="p-2">{t.ticket_type || "-"}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded bg-gray-100 border">
                        {t.status || "-"}
                      </span>
                    </td>
                    <td className="p-2">
                      {(t.shop_name || "-")}{t.branch_name ? ` / ${t.branch_name}` : ""}
                    </td>
                    <td className="p-2">
                      {t.branch_contact || t.phone || t.email || "-"}
                    </td>
                    <td className="p-2">
                      {t.attachment_filename ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadAttachment(t);
                          }}
                          className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                        >
                          Download
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border rounded-lg p-3 space-y-3">
          {!expandedTicket ? (
            <div className="text-gray-500">Select a ticket to view details</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  Ticket #{expandedTicket.ticket_id} ({expandedTicket.ticket_type})
                </div>
                <select
                  className="border rounded-lg px-2 py-1"
                  value={expandedTicket.status || "OPEN"}
                  onChange={e => setTicketStatus(expandedTicket.ticket_id, e.target.value)}
                >
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="border rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-600">User</div>
                  <div className="font-semibold">{expandedTicket.user_name || "-"}</div>
                </div>
                <div className="border rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-600">Contact</div>
                  <div className="font-semibold">
                    {expandedTicket.branch_contact || expandedTicket.phone || expandedTicket.email || "-"}
                  </div>
                </div>
                <div className="md:col-span-2 border rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-600">Shop / Branch</div>
                  <div className="font-semibold">
                    {(expandedTicket.shop_name || "-")}{expandedTicket.branch_name ? ` / ${expandedTicket.branch_name}` : ""}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3 bg-white">
                <div className="text-[10px] text-gray-600 mb-1">Message</div>
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed">
                  {expandedTicket.message || "-"}
                </pre>
              </div>

              {expandedTicket.attachment_filename && (
                <button
                  onClick={() => downloadAttachment(expandedTicket)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
                >
                  Download Attachment
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
