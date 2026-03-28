'use client';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export default function Panel({ children, className = '', title }: PanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={[
        'bg-white/[0.04] backdrop-blur-xl border border-white/10',
        'rounded-2xl overflow-hidden shadow-2xl',
        className,
      ].join(' ')}
    >
      {title && (
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-xs font-semibold tracking-widest text-sky-400 uppercase">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </motion.div>
  );
}
