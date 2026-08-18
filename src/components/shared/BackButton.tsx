import React from 'react';
import { ArrowRight } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  title?: string;
  variant?: 'light' | 'dark' | 'emerald';
  className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  title = "العودة للرئيسية",
  variant = 'light',
  className = ""
}) => {
  const variantStyles = {
    light: 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
    dark: 'bg-white/10 hover:bg-white/20 text-white border border-white/20',
    emerald: 'bg-emerald-900/40 hover:bg-emerald-900/60 text-white border border-emerald-700/50'
  };

  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      className={`w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs ${variantStyles[variant]} ${className}`}
    >
      <ArrowRight size={20} />
    </button>
  );
};
