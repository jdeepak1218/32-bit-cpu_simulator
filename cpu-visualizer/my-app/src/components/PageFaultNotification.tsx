'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCPUStore } from '@/lib/store';
import { AlertTriangle, Cpu, MemoryStick, X, ChevronRight, Map } from 'lucide-react';

export default function PageFaultNotification() {
  const {
    pageFaultNotification,
    clearPageFaultNotification,
    currentPageWalkSteps,
    setShowPageWalk,
    mmu,
  } = useCPUStore();

  const [isExpanded, setIsExpanded] = useState(false);

  // Auto collapse after notification changes
  useEffect(() => {
    if (pageFaultNotification) {
      setIsExpanded(true);
    }
  }, [pageFaultNotification]);

  if (!pageFaultNotification) return null;

  const mmuState = mmu.getState();

  return (
    <AnimatePresence>
      {pageFaultNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-20 right-6 z-50 max-w-md w-full"
        >
          <div className="bg-gradient-to-br from-red-900/95 to-red-950/95 border-2 border-red-500/60 rounded-xl shadow-2xl shadow-red-900/50 overflow-hidden backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-red-900/60 border-b border-red-700/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <AlertTriangle size={22} className="text-red-400" />
                  </motion.div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-300">
                    Page Fault Detected
                  </h3>
                  <p className="text-xs text-red-400/70 font-mono mt-0.5">
                    Cycle {pageFaultNotification.cycle.toString()}
                  </p>
                </div>
              </div>
              <button
                onClick={clearPageFaultNotification}
                className="p-1 rounded-full hover:bg-red-800/50 transition-colors"
              >
                <X size={16} className="text-red-400" />
              </button>
            </div>

            {/* Fault Details */}
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3 p-2.5 bg-red-950/60 rounded-lg border border-red-800/50">
                <div className="p-1.5 bg-red-900/60 rounded-lg">
                  <MemoryStick size={18} className="text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-red-400/70">Fault Address (Virtual)</div>
                  <div className="font-mono text-sm text-red-300 font-bold">
                    0x{pageFaultNotification.vaddr.toString(16).padStart(8, '0').toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 bg-red-950/60 rounded-lg border border-red-800/50">
                <div className="p-1.5 bg-red-900/60 rounded-lg">
                  <Cpu size={18} className="text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-red-400/70">MMU Status</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-red-300">
                      Page Faults: <span className="font-mono font-bold">{mmuState.pageFaults}</span>
                    </span>
                    <span className="text-xs text-red-300">
                      TLB Misses: <span className="font-mono">{mmuState.tlbMisses}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Page Walk Steps Preview */}
              {currentPageWalkSteps && currentPageWalkSteps.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-red-400/70">
                    <Map size={14} />
                    <span>Page Walk Steps ({currentPageWalkSteps.length})</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {currentPageWalkSteps.slice(0, 3).map((step, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                          step.valid
                            ? 'bg-red-950/40 text-red-300/80'
                            : 'bg-red-950/60 text-red-400'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          step.valid ? 'bg-red-800/50 text-red-300' : 'bg-red-900/60 text-red-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="truncate">{step.description}</span>
                      </div>
                    ))}
                    {currentPageWalkSteps.length > 3 && (
                      <div className="text-xs text-red-400/50 text-center pt-1">
                        ... and {currentPageWalkSteps.length - 3} more steps
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-2.5 bg-red-950/40 border-t border-red-800/50 flex items-center justify-between">
              <span className="text-xs text-red-400/60">
                {pageFaultNotification.description}
              </span>
              <button
                onClick={() => {
                  setShowPageWalk(true);
                  setIsExpanded(false);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                View Walk Details
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
