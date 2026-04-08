import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLES = {
  success: {
    bar:    "bg-emerald-500",
    icon:   "bg-emerald-500 text-white shadow-emerald-200",
    border: "border-emerald-100",
    label:  "text-emerald-600",
    glow:   "from-emerald-400/20 to-teal-400/10",
  },
  error: {
    bar:    "bg-rose-500",
    icon:   "bg-rose-500 text-white shadow-rose-200",
    border: "border-rose-100",
    label:  "text-rose-500",
    glow:   "from-rose-400/20 to-orange-400/10",
  },
  info: {
    bar:    "bg-blue-500",
    icon:   "bg-blue-500 text-white shadow-blue-200",
    border: "border-blue-100",
    label:  "text-blue-500",
    glow:   "from-blue-400/20 to-indigo-400/10",
  },
};

const LABELS = { success: "Success", error: "Error", info: "Info" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast stack — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => {
          const s = STYLES[t.type] || STYLES.success;
          return (
            <div
              key={t.id}
              style={{ animation: "toastSlideIn 0.35s cubic-bezier(.21,1.02,.73,1) forwards" }}
              className={`
                pointer-events-auto
                relative flex items-center gap-3
                pl-2 pr-10 py-2
                min-w-[300px] max-w-[380px]
                bg-white rounded-2xl border ${s.border}
                shadow-[0_8px_32px_rgba(0,0,0,0.12)]
                overflow-hidden
              `}
            >
              {/* Left color bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${s.bar}`} />

              {/* Icon bubble */}
              <div className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center shadow-md ${s.icon} ml-2`}>
                {ICONS[t.type] || ICONS.success}
              </div>

              {/* Text */}
              <div className="flex-1 py-1 min-w-0">
                <p className={`text-[11px] font-bold uppercase tracking-widest ${s.label}`}>
                  {LABELS[t.type] || "Notice"}
                </p>
                <p className="text-[13px] text-slate-700 font-medium leading-snug mt-0.5 truncate" title={t.message}>
                  {t.message}
                </p>
              </div>

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
                <div
                  className={`h-full ${s.bar} opacity-60`}
                  style={{ animation: "toastProgress 4s linear forwards" }}
                />
              </div>

              {/* Close */}
              <button
                onClick={() => removeToast(t.id)}
                className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition text-[11px]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
