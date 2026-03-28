'use client';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PanelProps {
  children:   ReactNode;
  className?: string;
  title?:     string;
}

export default function Panel({ children, className = '', title }: PanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={[
        /* Stronger glass — more opaque so text pops from 3D background */
        'bg-[#0b1120]/80 backdrop-blur-2xl',
        'border border-white/14 rounded-2xl overflow-hidden',
        'shadow-[0_8px_40px_rgba(0,0,0,0.55)]',
        className,
      ].join(' ')}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <span
            className="text-[11px] font-bold tracking-[0.18em] uppercase"
            style={{ color: '#7dd3fc' /* sky-300 — brighter than sky-400 */ }}
          >
            {title}
          </span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </motion.div>
  );
}
