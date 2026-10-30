import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
  requireInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  onConfirm: (inputValue?: string) => void;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  requireInput = false,
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  onConfirm,
  onClose,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requireInput && inputRequired && !inputValue.trim()) {
      setError('This field is required to proceed.');
      return;
    }
    onConfirm(inputValue);
    onClose();
  };

  const variantButtonStyles = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500',
    primary: 'bg-cyan-600 hover:bg-cyan-700 text-white focus:ring-cyan-500',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <AlertCircle
              size={20}
              className={
                variant === 'danger'
                  ? 'text-rose-600'
                  : variant === 'warning'
                  ? 'text-amber-600'
                  : 'text-cyan-600'
              }
            />
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

          {requireInput && (
            <div className="space-y-1.5">
              {inputLabel && (
                <label className="block text-xs font-medium text-slate-700">
                  {inputLabel} {inputRequired && <span className="text-rose-500">*</span>}
                </label>
              )}
              <textarea
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (error) setError('');
                }}
                rows={3}
                placeholder={inputPlaceholder || 'Provide details...'}
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
              {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800 bg-white border border-slate-300 rounded-lg shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantButtonStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
