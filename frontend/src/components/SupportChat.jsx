// src/components/SupportChat.jsx
import { useState, useRef } from "react";
import axios from "axios";
import { API_BASE } from "../config/api";
import { FaPaperPlane, FaTimes, FaImage } from "react-icons/fa";

export default function SupportChat({
  open = false,
  onClose = () => {},
  session = {},
  shopName = "",
  branchName = "",
  branchContact = ""
}) {

  const [messages, setMessages] = useState([
    {
      from: "system",
      text: "Hi 👋 — Tell us your issue. You can also attach a screenshot.",
      time: new Date().toLocaleTimeString()
    }
  ]);

  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState(null);
  const dropRef = useRef(null);

  if (!open) return null;

  const pushMessage = msg =>
    setMessages(prev => [...prev, {
      from: "user",
      text: msg,
      time: new Date().toLocaleTimeString()
    }]);

  const addFile = file => {
    if (!file) return;
    setAttachment(file); // only ONE file (backend supports single file)
  };

  const onDrop = e => {
    e.preventDefault();
    addFile(e.dataTransfer.files?.[0]);
  };

  const onPaste = e => {
    if (e.clipboardData.files?.length)
      addFile(e.clipboardData.files[0]);
  };

  const sendMessage = async () => {
    if (!input && !attachment) return;

    pushMessage(input || "(no text)");

    const formData = new FormData();
    formData.append("message", input || "(no text)");
    formData.append("user_name", session?.name || session?.user_name || "User");
    formData.append("shop_name", shopName || "N/A");
    formData.append("branch_name", branchName || session?.branch_name || "N/A");
    formData.append("branch_contact", branchContact || "N/A");

    // IMPORTANT — backend expects:  file
    if (attachment) formData.append("file", attachment);

    try {
      await axios.post(`${API_BASE}/support/message`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setMessages(prev => [...prev, {
        from: "system",
        text: "Support ticket sent successfully. Our team will contact you.",
        time: new Date().toLocaleTimeString()
      }]);

      setInput("");
      setAttachment(null);

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
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="w-[440px] h-[400px] mb-12 bg-white rounded-2xl shadow-2xl border flex flex-col"
      >

        {/* HEADER */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-blue-700 to-indigo-700 rounded-t-2xl text-white">
          <span className="font-bold text-lg">Haappii Support Chat</span>

          <button onClick={onClose} className="opacity-90 hover:opacity-100">
            <FaTimes />
          </button>
        </div>

        {/* CHAT BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from==="user"?"justify-end":"justify-start"}`}>
              <div className={`px-3 py-2 rounded-2xl shadow text-sm max-w-[85%]
                ${m.from==="user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-gray-100 text-gray-800 rounded-bl-none"}`}
              >
                <p>{m.text}</p>
                <p className="text-[10px] opacity-70 mt-1">{m.time}</p>
              </div>
            </div>
          ))}

          {attachment && (
            <div className="text-xs text-gray-600">
              📎 Attached: <span className="font-semibold">{attachment.name}</span>
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
              onChange={e => addFile(e.target.files?.[0])}
            />
          </label>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
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

      </div>
    </div>
  );
}
