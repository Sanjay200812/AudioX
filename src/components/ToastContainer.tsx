'use client';

import React from 'react';
import { useAudioX } from '@/context/AudioXContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useAudioX();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 p-3 rounded-xl shadow-2xl border backdrop-blur-xl text-xs font-medium transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
              isSuccess
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
                : isError
                ? 'bg-red-950/90 border-red-500/30 text-red-100'
                : 'bg-zinc-900/90 border-white/10 text-zinc-200'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : isError ? (
              <AlertCircle size={16} className="text-red-400 shrink-0" />
            ) : (
              <Info size={16} className="text-indigo-400 shrink-0" />
            )}

            <span className="flex-1 leading-snug">{toast.message}</span>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
