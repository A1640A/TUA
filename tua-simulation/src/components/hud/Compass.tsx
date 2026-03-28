'use client';
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Compass() {
  return (
    <div className="w-14 h-14 relative">
      <div className="w-full h-full rounded-full border border-white/15 bg-white/5 backdrop-blur-md flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 relative"
        >
          {/* N needle */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-3.5 bg-sky-400 rounded-full" />
          {/* S needle */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-3.5 bg-white/30 rounded-full" />
        </motion.div>
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-sky-400 font-mono font-bold">N</span>
      </div>
    </div>
  );
}
