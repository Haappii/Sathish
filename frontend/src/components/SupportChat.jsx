// src/components/SupportChat.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import authAxios from "../api/authAxios";
import {
  FaPaperPlane, FaTimes, FaImage, FaPlus, FaArrowLeft,
  FaHeadset, FaTicketAlt, FaTrash,
} from "react-icons/fa";
import { MdSupportAgent } from "react-icons/md";

const BLUE = "#0B3C8C";
const MAX_CHARS = 1000;

/* ── parse appended message thread into chat bubbles ─────────────────────── */
// Backend appends: "[dd-mm-yyyy HH:MM:SS] user_name: message"
function parseThread(raw) {
  if (!raw) return [];
  const blocks = raw.split(/\n\n(?=\[)/);
  return blocks.map((block) => {
    const match = block.match(/^\[(.+?)\]\s+(.+?):\s+([\s\S]*)$/);
    if (match) {
      return { time: match[1].trim(), author: match[2].trim(), text: match[3].trim(), parsed: true };
    }
    return { time: "", author: "User", text: block.trim(), parsed: false };
  }).filter((b) => b.text);
}

/* ── status badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const s = String(status || "").toUpperCase();
  const map = {
    OPEN:     "bg-emerald-50 text-emerald-700 border-emerald-200",
    CLOSED:   "bg-slate-100 text-slate-600 border-slate-200",
    RESOLVED: "bg-blue-50 text-blue-700 border-blue-200",
    PENDING:  "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[s] || map.OPEN}`}>
      {s || "OPEN"}
    </span>
  );
}

/* ── chat bubble ──────────────────────────────────────────────────────────── */
function Bubble({ from, text, time }) {
  const isUser   = from === "user";
  const isSystem = from === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] text-slate-400 bg-slate-100 rounded-full px-3 py-1">
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mb-1">
          <MdSupportAgent size={13} style={{ color: BLUE }} />
        </div>
      )}
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
        isUser
          ? "text-white rounded-br-sm"
          : "bg-slate-100 text-slate-800 rounded-bl-sm"
      }`} style={isUser ? { background: BLUE } : {}}>
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        {time && (
          <p className={`text-[10px] mt-1 ${isUser ? "text-white/60 text-right" : "text-slate-400"}`}>
            {time}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── attachment preview ───────────────────────────────────────────────────── */
function AttachmentPreview({ file, onRemove }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 bg-slate-50 border rounded-xl px-3 py-2">
      {src ? (
        <img src={src} alt="preview" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs text-slate-500">
          📎
        </div>
      )}
      <span className="text-xs text-slate-600 truncate flex-1">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-slate-400 hover:text-rose-500 transition flex-shrink-0"
      >
        <FaTrash size={11} />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function SupportChat({
  open = false,
  onClose = () => {},
  session = {},
  shopName = "",
  branchName = "",
  branchContact = "",
}) {
  const [messages, setMessages]     = useState([]);
  const [ticketId, setTicketId]     = useState(null);
  const [tickets, setTickets]       = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [mode, setMode]             = useState("list"); // list | chat

  const [input, setInput]           = useState("");
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState("");

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── auto-scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── load tickets ── */
  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const res = await authAxios.get("/support/my");
      setTickets(res?.data || []);
    } catch {
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  /* ── reset on open ── */
  useEffect(() => {
    if (!open) return;
    setMode("list");
    setTicketId(null);
    setMessages([]);
    setInput("");
    setAttachment(null);
    setSendError("");
    loadTickets();
  }, [open, loadTickets]);

  if (!open) return null;

  /* ── start new ticket ── */
  const startNewTicket = () => {
    setTicketId(null);
    setMessages([{
      from: "system",
      text: "New support ticket — describe your issue below.",
      time: "",
    }]);
    setMode("chat");
    setSendError("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  /* ── continue existing ticket ── */
  const continueTicket = (ticket) => {
    setTicketId(ticket.ticket_id);
    const history = parseThread(ticket.message || "");
    const bubbles = history.map((b) => ({
      from: "user",
      text: b.author ? `${b.author}: ${b.text}` : b.text,
      time: b.time,
    }));
    setMessages([
      { from: "system", text: `Ticket #${ticket.ticket_id} · ${ticket.status || "OPEN"}`, time: "" },
      ...bubbles,
      { from: "system", text: "You can add more details below.", time: "" },
    ]);
    setMode("chat");
    setSendError("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  /* ── send ── */
  const sendMessage = async () => {
    if ((!input.trim() && !attachment) || sending) return;
    setSendError("");
    setSending(true);

    const userText = input.trim() || "(attachment only)";
    setMessages((prev) => [
      ...prev,
      { from: "user", text: userText, time: new Date().toLocaleTimeString() },
    ]);
    setInput("");

    const formData = new FormData();
    formData.append("message", userText);
    formData.append("user_name", session?.name || session?.user_name || "User");
    formData.append("shop_name", shopName || "N/A");
    formData.append("branch_name", branchName || session?.branch_name || "N/A");
    formData.append("branch_contact", branchContact || "N/A");
    if (ticketId) formData.append("ticket_id", ticketId);
    if (attachment) formData.append("file", attachment);

    try {
      const res = await authAxios.post("/support/message", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newId = res?.data?.ticket_id;
      if (newId && !ticketId) setTicketId(newId);
      setAttachment(null);
      setMessages((prev) => [
        ...prev,
        {
          from: "support",
          text: newId
            ? `Ticket #${newId} saved. Our team will get back to you soon.`
            : "Message added to your ticket.",
          time: new Date().toLocaleTimeString(),
        },
      ]);
      loadTickets();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Failed to send. Please try again.";
      setSendError(msg);
      // remove the optimistic user bubble
      setMessages((prev) => prev.slice(0, -1));
      setInput(userText === "(attachment only)" ? "" : userText);
    } finally {
      setSending(false);
    }
  };

  /* ── keyboard ── */
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── file helpers ── */
  const addFile = (file) => { if (file) setAttachment(file); };
  const onDrop  = (e) => { e.preventDefault(); addFile(e.dataTransfer.files?.[0]); };
  const onPaste = (e) => { if (e.clipboardData.files?.length) addFile(e.clipboardData.files[0]); };

  const charsLeft = MAX_CHARS - input.length;

  /* ── render ── */
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end justify-end z-[2000] p-4 sm:p-6"
      onPaste={onPaste}
    >
      <div
        className="w-full sm:w-[400px] h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: BLUE }}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <FaHeadset size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">
              {mode === "chat" && ticketId ? `Ticket #${ticketId}` : "Haappii Support"}
            </p>
            <p className="text-[11px] text-white/70">
              {mode === "chat" && !ticketId ? "New ticket" : "We're here to help"}
            </p>
          </div>
          {mode === "chat" && (
            <button
              type="button"
              onClick={() => setMode("list")}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition mr-1"
              title="All tickets"
            >
              <FaArrowLeft size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <FaTimes size={12} />
          </button>
        </div>

        {/* ══ LIST MODE ══ */}
        {mode === "list" && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* new ticket CTA */}
            <div className="p-4 border-b bg-slate-50">
              <button
                onClick={startNewTicket}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                style={{ background: BLUE }}
              >
                <FaPlus size={11} /> Raise New Issue
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Previous Tickets
              </p>

              {loadingTickets && (
                <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                  <span className="text-xs">Loading tickets…</span>
                </div>
              )}

              {!loadingTickets && tickets.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <FaTicketAlt size={20} className="text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-500">No previous tickets</p>
                  <p className="text-xs text-slate-400">Raise an issue to get started</p>
                </div>
              )}

              {tickets.map((t) => (
                <button
                  key={t.ticket_id}
                  type="button"
                  onClick={() => continueTicket(t)}
                  className="w-full text-left border rounded-xl p-3 hover:bg-slate-50 hover:border-blue-200 transition space-y-1.5 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition">
                      Ticket #{t.ticket_id}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {t.message?.replace(/\[\d{2}-\d{2}-\d{4}.*?\]/g, "").trim() || "No details"}
                  </p>
                  {t.created_on && (
                    <p className="text-[10px] text-slate-400">
                      {new Date(t.created_on).toLocaleString()}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══ CHAT MODE ══ */}
        {mode === "chat" && (
          <>
            {/* messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((m, i) => (
                <Bubble key={i} from={m.from} text={m.text} time={m.time} />
              ))}
              {sending && (
                <div className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <MdSupportAgent size={13} style={{ color: BLUE }} />
                  </div>
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* send error */}
            {sendError && (
              <div className="mx-3 mb-1 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {sendError}
              </div>
            )}

            {/* attachment preview */}
            {attachment && (
              <AttachmentPreview file={attachment} onRemove={() => setAttachment(null)} />
            )}

            {/* input bar */}
            <div className="border-t flex-shrink-0">
              <div className="flex items-end gap-2 p-3">
                {/* file attach */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex items-center justify-center rounded-xl border text-slate-500 hover:bg-slate-50 hover:text-blue-700 transition flex-shrink-0 mb-0.5"
                  title="Attach image"
                >
                  <FaImage size={13} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt"
                  className="hidden"
                  onChange={(e) => addFile(e.target.files?.[0])}
                />

                {/* textarea */}
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
                    onKeyDown={onKeyDown}
                    placeholder="Describe your issue… (Enter to send)"
                    rows={2}
                    className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 pr-12"
                    style={{ maxHeight: 100 }}
                  />
                  {input.length > MAX_CHARS * 0.8 && (
                    <span className={`absolute bottom-2 right-2 text-[10px] ${charsLeft < 50 ? "text-rose-500" : "text-slate-400"}`}>
                      {charsLeft}
                    </span>
                  )}
                </div>

                {/* send */}
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending || (!input.trim() && !attachment)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-white transition disabled:opacity-40 flex-shrink-0 mb-0.5"
                  style={{ background: BLUE }}
                  title="Send (Enter)"
                >
                  {sending
                    ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    : <FaPaperPlane size={12} />
                  }
                </button>
              </div>

              <p className="text-[10px] text-center text-slate-400 pb-2">
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
