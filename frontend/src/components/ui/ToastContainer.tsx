import { AnimatePresence, motion } from "framer-motion";
import { useToastStore } from "../../stores/toast";
import type { ToastType } from "../../stores/toast";

const typeStyles: Record<ToastType, string> = {
  success: "border-green-800 text-green-300",
  error: "border-red-800 text-red-300",
  info: "border-neutral-700 text-neutral-300",
};

const typeIcons: Record<ToastType, string> = {
  success: "ok",
  error: "err",
  info: "i",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded border bg-neutral-950 shadow-lg max-w-sm cursor-pointer ${typeStyles[toast.type]}`}
            onClick={() => removeToast(toast.id)}
          >
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
              {typeIcons[toast.type]}
            </span>
            <span className="text-xs">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
