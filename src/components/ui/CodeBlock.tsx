import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface CodeBlockProps {
  code: string;
  label?: string;
  tone?: 'default' | 'danger' | 'success';
}

export function CodeBlock({ code, label, tone = 'default' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useApp();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      showToast('Copied to clipboard');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Copy unavailable in this browser');
    }
  };

  const borderTone =
    tone === 'danger'
      ? 'border-red-500/25 bg-red-500/[0.04]'
      : tone === 'success'
        ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
        : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#090B0E]';

  return (
    <div className={`rounded-lg border overflow-hidden ${borderTone}`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200/70 dark:border-white/[0.06]">
        <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
          {label || 'Snippet'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code snippet"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs leading-relaxed font-mono text-slate-800 dark:text-zinc-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}
