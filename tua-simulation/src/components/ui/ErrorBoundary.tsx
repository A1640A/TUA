'use client';
import React, { Component, ReactNode } from 'react';

interface Props  { children: ReactNode; }
interface State  { hasError: boolean; message: string; }

/**
 * React Error Boundary wrapping the 3D scene and control panels.
 * On an unrecoverable render crash, displays a professional dark-mode
 * "Sistem Arızası" recovery card with a reload button — ensuring judges
 * never see a blank white crash screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[TUA ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center w-full h-screen bg-[#080810]">
        <div
          className="flex flex-col items-center gap-5 max-w-sm text-center p-8 rounded-2xl border"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(239,68,68,0.25)',
            boxShadow:   '0 0 60px rgba(239,68,68,0.08)',
          }}
        >
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <span className="text-red-400 text-xl">⚠</span>
          </div>
          <div>
            <p className="text-xs font-mono text-red-400 tracking-[0.3em] uppercase mb-2">
              Sistem Arızası
            </p>
            <p className="text-white/60 text-sm">Simülasyon modülü beklenmedik bir hatayla karşılaştı.</p>
            {this.state.message && (
              <p className="mt-2 text-[10px] font-mono text-white/25 break-all">{this.state.message}</p>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-lg text-xs font-semibold font-mono tracking-wider text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all"
          >
            Sistemi Yeniden Başlat
          </button>
        </div>
      </div>
    );
  }
}
