// src/components/SupportChat.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import authAxios from "../api/authAxios";
import { API_BASE } from "../config/api";
import {
  FaPaperPlane,
  FaTimes,
  FaImage,
  FaPlus,
  FaArrowLeft,
} from "react-icons/fa";

export default function SupportChat({
  open = false,
  onClose = () => {},
  session = {},
  shopName = "",
  branchName = "",
  branchContact = "",
}) {
  const baseSystemMessage = useMemo(
    () => ({
      from: "system",
      text: "Hi — choose Raise Issue to open a new ticket or continue an older one. You can attach a screenshot.",
      time: new Date().toLocaleTimeString(),
    }),
    []
  );

  const [messages, setMessages] = useState([baseSystemMessage]);
  const [ticketId, setTicketId] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [mode, setMode] = useState("list"); // list | chat

  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState(null);
  const dropRef = useRef(null);

  const pushMessage = (msg, from = "user") =>
    setMessages((prev) => [
      ...prev,
      {
        from,
        text: msg,
        time: new Date().toLocaleTimeString(),
      },
    ]);

  const addFile = (file) => {
    if (!file) return;
    setAttachment(file); // only ONE file (backend supports single file)
  };

  const onDrop = (e) => {
    e.preventDefault();
    addFile(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e) => {
    if (e.clipboardData.files?.length) addFile(e.clipboardData.files[0]);
  };

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const res = await authAxios.get("/support/my");
      setTickets(res?.data || []);
    } catch (err) {
      console.error("Failed to load tickets", err);
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode("list");
    setTicketId(null);
    setMessages([baseSystemMessage]);
    setInput("");
    setAttachment(null);
    loadTickets();
  }, [open, loadTickets, baseSystemMessage]);

  if (!open) return null;

  const startNewTicket = () => {
    setTicketId(null);
    setMessages([baseSystemMessage]);
    setMode("chat");
  };

  const continueTicket = (ticket) => {
    setTicketId(ticket.ticket_id);
    setMessages([
      {
        from: "system",
        text: `Continuing ticket #${ticket.ticket_id} (${ticket.status})`,
        time: new Date().toLocaleTimeString(),
      },
      {
        from: "system",
        text: `Last note: ${ticket.message?.slice(0, 180) || "No details"}`,
        time: new Date().toLocaleTimeString(),
      },
    ]);
    setMode("chat");
  };

  const sendMessage = async () => {
    if (!input && !attachment) return;

    pushMessage(input || "(no text)", "user");

    const formData = new FormData();
    formData.append("message", input || "(no text)");
    formData.append("user_name", session?.name || session?.user_name || "User");
    formData.append("shop_name", shopName || "N/A");
    formData.append("branch_name", branchName || session?.branch_name || "N/A");
    formData.append("branch_contact", branchContact || "N/A");
    if (ticketId) formData.append("ticket_id", ticketId);

    if (attachment) formData.append("file", attachment);

    try {
      const res = await axios.post(`${API_BASE}/support/message`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newTicketId = res?.data?.ticket_id;
      if (newTicketId && !ticketId) {
        setTicketId(newTicketId);
      }

      pushMessage(
        newTicketId
          ? `Saved to ticket #${newTicketId}. We'll follow up soon.`
          : "Support ticket sent successfully. Our team will contact you.",
        "system"
      );

      setInput("");
      setAttachment(null);

      // refresh ticket list in background
      loadTickets();
    } catch (err) {
      console.error(err);
      alert("Failed to send support request");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end justify-end p-6 z-[2000]"
      onPaste={onPaste}
    >
      <div
        ref={dropRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="w-[460px] h-[440px] mb-12 bg-white rounded-2xl shadow-2xl border flex flex-col"
      >
        {/* HEADER */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-blue-700 to-indigo-700 rounded-t-2xl text-white">
          <span className="font-bold text-lg">
            {mode === "chat" && ticketId
              ? `Support • Ticket #${ticketId}`
              : "Haappii Support"}
          </span>

          <button onClick={onClose} className="opacity-90 hover:opacity-100">
            <FaTimes />
          </button>
        </div>

        {mode === "list" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-800">
                Older issues
              </div>
              <button
                onClick={startNewTicket}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 text-sm"
              >
                <FaPlus /> Raise Issue
              </button>
            </div>

            {loadingTickets && (
              <div className="text-xs text-gray-500">Loading tickets...</div>
            )}

            {!loadingTickets && tickets.length === 0 && (
              <div className="text-xs text-gray-500">
                No tickets found for this branch.
              </div>
            )}

            <div className="space-y-2">
              {tickets.map((t) => (
                <div
                  key={t.ticket_id}
                  className="border rounded-xl p-3 hover:bg-gray-50 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Ticket #{t.ticket_id}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        t.status === "OPEN"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-600 line-clamp-2">
                    {t.message}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {t.created_on
                      ? new Date(t.created_on).toLocaleString()
                      : ""}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => continueTicket(t)}
                      className="text-[11px] px-3 py-1 rounded-lg border text-blue-700 hover:bg-blue-50"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "chat" && (
          <>
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
              <button
                onClick={() => setMode("list")}
                className="text-[12px] flex items-center gap-1 text-slate-600 hover:text-slate-900"
              >
                <FaArrowLeft /> Back
              </button>
              <div className="text-[12px] text-slate-600">
                {ticketId
                  ? `Continuing ticket #${ticketId}`
                  : "New ticket will be created"}
              </div>
            </div>

            {/* CHAT BODY */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${
                    m.from === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`px-3 py-2 rounded-2xl shadow text-sm max-w-[85%]
                    ${
                      m.from === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-100 text-gray-800 rounded-bl-none"
                    }`}
                  >
                    <p>{m.text}</p>
                    <p className="text-[10px] opacity-70 mt-1">{m.time}</p>
                  </div>
                </div>
              ))}

              {attachment && (
                <div className="text-xs text-gray-600">
                  📎 Attached:{" "}
                  <span className="font-semibold">{attachment.name}</span>
                </div>
              )}
            </div>

            {/* INPUT BAR */}
            <div className="border-t p-3 flex items-center gap-2">
              <label className="p-2 rounded-xl border cursor-pointer hover:bg-gray-50 flex items-center gap-1">
                <FaImage />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => addFile(e.target.files?.[0])}
                />
              </label>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message…"
                className="flex-1 border rounded-xl px-3 py-2 resize-none h-10"
              />

              <button
                onClick={sendMessage}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow flex items-center gap-2"
              >
                <FaPaperPlane /> Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
