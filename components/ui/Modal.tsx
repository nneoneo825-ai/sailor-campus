import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
}

const WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  width = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(open);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open && !prevOpen.current) {
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    }
    if (!open && prevOpen.current) {
      document.body.style.overflow = '';
    }
    prevOpen.current = open;
    return () => { document.body.style.overflow = ''; clearTimeout(closeTimerRef.current); };
  }, [open]);

  useEffect(() => {
    if (!closeOnEsc || !open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [closeOnEsc, open]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  if (!open && !isClosing) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[8000] flex items-center justify-center p-4 ${isClosing ? 'animate-overlay-out' : 'animate-overlay-in'}`}
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (closeOnOverlayClick && e.target === overlayRef.current) handleClose(); }}
    >
      <div
        className={`${isClosing ? 'animate-modal-out' : 'animate-modal-in'} bg-white rounded-2xl shadow-2xl w-full ${WIDTH_MAP[width]} overflow-hidden flex flex-col max-h-[85vh]`}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
            {showCloseButton && (
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// Reusable button styles
export const ModalButton = {
  cancel: (onClick: () => void, text = '取消') => (
    <button
      key="cancel"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1"
    >
      {text}
    </button>
  ),
  confirm: (onClick: () => void, text = '确定', color: string = 'blue') => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      green: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      amber: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    };
    return (
      <button
        key="confirm"
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${colors[color] || colors.blue}`}
      >
        {text}
      </button>
    );
  },
};

export default Modal;
