'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onExportPDF: () => void;
  onExportExcel: () => void;
  disabled?: boolean;
}

export const ExportMenu = ({ onExportPDF, onExportExcel, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 text-white font-medium rounded-lg transition-all',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Download className="w-4 h-4" />
        Exportar
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-[var(--navy2)] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => {
              onExportPDF();
              setOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <FileText className="w-4 h-4 text-red-400" />
            Exportar PDF
          </button>
          <button
            onClick={() => {
              onExportExcel();
              setOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-green-400" />
            Exportar Excel
          </button>
        </div>
      )}
    </div>
  );
};
