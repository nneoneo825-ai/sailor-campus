import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  closing?: boolean;
}

interface ToastNamespace {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

interface ToastContextType {
  toast: ToastNamespace;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const ICONS: Record<ToastType, string> = {
  success: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#2563eb"/><path d="M6 10l3 3 5-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  error: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#ef4444"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#f59e0b"/><path d="M10 6v4M10 13v.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#2563eb"/><path d="M10 9v5M10 6.5v.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'border-l-blue-500',
  error: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

const PROGRESS_COLORS: Record<ToastType, string> = {
  success: 'bg-blue-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

let idCounter = 0;

const ToastItemComponent: React.FC<{ item: ToastItem; onClose: (id: number) => void }> = ({ item, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClose = useCallback(() => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => onClose(item.id), 250);
  }, [item.id, onClose]);

  useEffect(() => {
    if (item.duration > 0) {
      timerRef.current = setTimeout(handleClose, item.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [item.duration, handleClose]);

  return (
    <div
      className={`${isClosing ? 'animate-toast-out' : 'animate-toast-in'} pointer-events-auto mb-3 w-80`}
      onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onMouseLeave={() => { timerRef.current = setTimeout(handleClose, item.duration); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl shadow-slate-200/50 border border-slate-100 border-l-4 ${BORDER_COLORS[item.type]} overflow-hidden`}>
        <div className="flex items-start gap-3 p-4">
          <span dangerouslySetInnerHTML={{ __html: ICONS[item.type] }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
            {item.message && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.message}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        {item.duration > 0 && (
          <div className="h-0.5 bg-slate-100">
            <div
              className={`h-full ${PROGRESS_COLORS[item.type]} transition-none`}
              style={{
                animation: `shrink ${item.duration}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((
    title: string,
    options?: { type?: ToastType; message?: string; duration?: number }
  ) => {
    const id = ++idCounter;
    const item: ToastItem = {
      id,
      type: options?.type || 'info',
      title,
      message: options?.message,
      duration: options?.duration ?? 3500,
    };
    setToasts(prev => [...prev, item]);
  }, []);

  const success = useCallback((title: string, message?: string) => addToast(title, { type: 'success', message }), [addToast]);
  const error = useCallback((title: string, message?: string) => addToast(title, { type: 'error', message }), [addToast]);
  const warning = useCallback((title: string, message?: string) => addToast(title, { type: 'warning', message }), [addToast]);
  const info = useCallback((title: string, message?: string) => addToast(title, { type: 'info', message }), [addToast]);

  const ctx: ToastContextType = {
    toast: { success, error, warning, info },
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
        {toasts.map(t => (
          <ToastItemComponent key={t.id} item={t} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
