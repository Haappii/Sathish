import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();

    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000); // auto hide
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="fixed top-4 right-4 z-[999] space-y-3">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`
              relative flex items-start gap-3 px-4 py-3 min-w-[320px]
              rounded-2xl backdrop-blur-xl border
              shadow-[0_20px_50px_rgba(0,0,0,.18)]
              animate-toast-in select-none overflow-hidden

              ${t.type === "success"
                ? "bg-white/95 border-emerald-300"
                : "bg-white/95 border-rose-300"}
            `}
          >
            {/* Accent Glow (BEHIND everything) */}
            <div
              className={`
                absolute inset-0 opacity-[.25] blur-xl -z-10 pointer-events-none
                ${t.type === "success"
                  ? "bg-gradient-to-r from-emerald-300 to-teal-300"
                  : "bg-gradient-to-r from-rose-300 to-red-300"}
              `}
            />

            {/* Icon */}
            <div
              className={`
                relative z-10 shrink-0 w-9 h-9 rounded-xl
                grid place-items-center font-bold text-lg
                ${t.type === "success"
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                  : "bg-rose-100 text-rose-700 border border-rose-300"}
              `}
            >
              {t.type === "success" ? "✓" : "!"}
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 pr-8">
              <div className="font-semibold tracking-wide text-slate-800">
                {t.type === "success" ? "Success" : "Warning"}
              </div>

              <div className="text-[13px] leading-snug text-slate-600">
                {t.message}
              </div>

              {/* Progress bar */}
              <div className="mt-2 h-[3px] rounded-full overflow-hidden bg-slate-200/70">
                <div
                  className={`
                    h-full animate-toast-progress
                    ${t.type === "success"
                      ? "bg-emerald-500"
                      : "bg-rose-500"}
                  `}
                />
              </div>
            </div>

            {/* CLOSE BUTTON (always visible) */}
            <button
              onClick={() => removeToast(t.id)}
              className="
                absolute top-2 right-2 z-20
                w-7 h-7 rounded-full
                grid place-items-center
                text-slate-600 hover:text-slate-900
                bg-white/70 hover:bg-white
                border shadow-sm
                transition
              "
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
