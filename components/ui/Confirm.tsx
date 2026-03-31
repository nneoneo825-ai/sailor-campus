import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  confirmColor?: string;
}

type ConfirmResult = boolean | null;

interface ConfirmContextType {
  confirm: (message: string, options?: Partial<ConfirmOptions>) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

let confirmIdCounter = 0;

interface ConfirmItem {
  id: number;
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
}

const ConfirmDialog: React.FC<{ item: ConfirmItem; onClose: (id: number, result: boolean) => void }> = ({ item, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (btnRef.current) btnRef.current.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => { document.removeEventListener('keydown', handleEsc); clearTimeout(closeTimerRef.current); };
  }, []);

  const handleClose = (result: boolean) => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => onClose(item.id, result), 200);
  };

  const typeConfig = {
    danger: {
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      ),
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const cfg = typeConfig[item.options.type || 'warning'];

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${isClosing ? 'animate-overlay-out' : 'animate-overlay-in'}`}
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(false); }}
    >
      <div className={`${isClosing ? 'animate-modal-out' : 'animate-modal-in'} bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden`}>
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-11 h-11 rounded-full ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center`}>
              {cfg.icon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              {item.options.title && (
                <h3 className="text-base font-semibold text-slate-800 mb-1">{item.options.title}</h3>
              )}
              <p className="text-sm text-slate-600 leading-relaxed">{item.options.message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50/80 flex justify-end gap-3">
          <button
            onClick={() => handleClose(false)}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1"
          >
            {item.options.cancelText || '取消'}
          </button>
          <button
            ref={btnRef}
            onClick={() => handleClose(true)}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${cfg.confirmBtn}`}
          >
            {item.options.confirmText || '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ConfirmItem[]>([]);

  const confirm = useCallback((message: string, options?: Partial<ConfirmOptions>): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const id = ++confirmIdCounter;
      const item: ConfirmItem = {
        id,
        options: {
          message,
          type: 'warning',
          confirmText: '确定',
          cancelText: '取消',
          ...options,
        },
        resolve,
      };
      setItems(prev => [...prev, item]);
    });
  }, []);

  const handleClose = useCallback((id: number, result: boolean) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) {
        setTimeout(() => item.resolve(result), 0);
      }
      return prev.filter(i => i.id !== id);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {items.map(item => (
        <ConfirmDialog key={item.id} item={item} onClose={handleClose} />
      ))}
    </ConfirmContext.Provider>
  );
};
