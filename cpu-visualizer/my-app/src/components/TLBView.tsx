'use client';

import React from 'react';
import { useCPUStore } from '@/lib/store';
import {
  TLB_ENTRIES,
  extractOffset,
  formatFlags,
  PAGE_SIZE,
} from '@/types/cpu';
import { CheckCircle, XCircle } from 'lucide-react';

export default function TLBView() {
  const { mmu, highlightedTLBEntry, setHighlightedTLBEntry, setShowPageWalk, currentPageWalkSteps, setCurrentPageWalkSteps } = useCPUStore();
  const mmuState = mmu.getState();

  const totalAccesses = mmuState.tlbHits + mmuState.tlbMisses;
  const hitRate = totalAccesses > 0 ? (mmuState.tlbHits / totalAccesses * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
      <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
        <h2 className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
          TLB (Translation Lookaside Buffer)
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {TLB_ENTRIES} Entries, Fully Associative, FIFO Replacement
        </p>
      </div>

      <div className="px-4 py-2 bg-gradient-to-r from-gray-800/80 to-gray-800/40 border-b border-gray-700">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500">Hits</div>
            <div className="text-sm font-mono text-green-400">{mmuState.tlbHits}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Misses</div>
            <div className="text-sm font-mono text-red-400">{mmuState.tlbMisses}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Hit Rate</div>
            <div className={`text-sm font-mono ${parseFloat(hitRate) > 80 ? 'text-green-400' : 'text-amber-400'}`}>
              {hitRate}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Page Faults</div>
            <div className="text-sm font-mono text-red-400">{mmuState.pageFaults}</div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-4 gap-2">
          {mmuState.tlb.map((entry, index) => {
            const isHighlighted = highlightedTLBEntry === index;
            const isNext = mmuState.tlbNext === index;

            return (
              <div
                key={index}
                className={`p-2 rounded border transition-all duration-150 cursor-pointer ${
                  isHighlighted
                    ? 'scale-[1.02] border-cyan-400 bg-cyan-900/20'
                    : entry.valid
                    ? 'border-green-500/50 bg-green-900/10'
                    : 'border-gray-700 bg-gray-800/80'
                } ${isNext ? 'ring-1 ring-amber-400' : ''}`}
                onClick={() => setHighlightedTLBEntry(isHighlighted ? null : index)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-gray-500">Entry {index}</span>
                  {isNext && (
                    <span className="text-xs text-amber-400 font-semibold">Next</span>
                  )}
                  <div className={`flex items-center gap-1 ${entry.valid ? 'text-green-400' : 'text-gray-600'}`}>
                    {entry.valid ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    <span className="text-xs">{entry.valid ? 'Valid' : 'Invalid'}</span>
                  </div>
                </div>

                {entry.valid ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">VPN:</span>
                      <span className="text-xs font-mono text-cyan-400">
                        0x{entry.vpn.toString(16).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Frame:</span>
                      <span className="text-xs font-mono text-green-400">
                        0x{(entry.paddr >>> 12).toString(16).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">PA:</span>
                      <span className="text-xs font-mono text-gray-300">
                        0x{entry.paddr.toString(16).padStart(8, '0').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Flags:</span>
                      <span className="text-xs font-mono text-amber-400">
                        {formatFlags(entry.flags)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 italic">Empty</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentPageWalkSteps && currentPageWalkSteps.length > 0 && (
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-amber-400">Page Table Walk</h3>
            <button
              onClick={() => {
                setShowPageWalk(false);
                setCurrentPageWalkSteps(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {currentPageWalkSteps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 p-2 rounded border ${
                  step.valid
                    ? 'bg-green-900/20 border-green-500/30'
                    : 'bg-red-900/20 border-red-500/30'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate">{step.description}</div>
                  <div className="text-xs font-mono text-gray-500">
                    0x{step.address.toString(16).padStart(8, '0').toUpperCase()}
                    {step.value !== undefined && ` | 0x${step.value.toString(16).toUpperCase()}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 bg-gradient-to-r from-gray-800/40 to-gray-800/20 border-t border-gray-700">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-emerald-500/40 to-emerald-500/10 border border-emerald-500/50 shadow-sm shadow-emerald-500/20"></div>
            <span className="text-gray-500">Valid Entry</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-700/60 border border-gray-600"></div>
            <span className="text-gray-500">Empty</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm ring-1 ring-amber-400 ring-offset-1 ring-offset-gray-800 bg-amber-900/20"></div>
            <span className="text-gray-500">Next (FIFO)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
