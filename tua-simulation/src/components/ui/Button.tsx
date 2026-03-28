'use client';
import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}

const variants = {
  primary: 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 disabled:bg-sky-800',
  ghost:   'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10',
  danger:  'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30',
};
const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export default function Button({
  children, variant = 'primary', size = 'md',
  loading, className = '', disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'font-semibold rounded-xl transition-all duration-150 flex items-center gap-2',
        'disabled:opacity-40 disabled:cursor-not-allowed tracking-wide',
        variants[variant], sizes[size], className,
      ].join(' ')}
    >
      {loading && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
