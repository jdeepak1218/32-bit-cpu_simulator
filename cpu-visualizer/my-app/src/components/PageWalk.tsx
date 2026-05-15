'use client';

import React, { useEffect, useState } from 'react';
import { useCPUStore } from '@/lib/store';
import { Pause, Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageWalkStep } from '@/types/cpu';

export default function PageWalk() {
  const { showPageWalk, currentPageWalkSteps, setShowPageWalk } = useCPUStore();
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const steps: PageWalkStep[] = currentPageWalkSteps || [];

  useEffect(() => {
    if (!showPageWalk) {
      setPlaying(false);
      setIndex(0);
    }
  }, [showPageWalk]);

  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), 600);
    return () => clearTimeout(t);
  }, [playing, index, steps.length]);

  if (!showPageWalk || !steps.length) return null;

  const step = steps[Math.min(index, steps.length - 1)];

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-cyan-400">Page Table Walker</h3>
          <div className="text-xs text-gray-500">Step {Math.min(index + 1, steps.length)}/{steps.length}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center gap-1"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => setShowPageWalk(false)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center gap-1"
          >
            <X size={14} /> Close
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-8">
          <div
            key={index}
            className="p-3 bg-gray-800/50 rounded border border-gray-700 min-h-[96px] transition-all duration-200"
          >
            <div className="text-xs font-mono text-gray-300">{step?.description}</div>
            {typeof step?.address !== 'undefined' && (
              <div className="text-xs text-gray-500 mt-2 font-mono">Address: 0x{step.address.toString(16).toUpperCase()}</div>
            )}
            {typeof step?.value !== 'undefined' && (
              <div className="text-xs text-gray-500 mt-1 font-mono">Value: 0x{step.value.toString(16).toUpperCase()}</div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
            <div className="text-xs text-gray-500 ml-2">Tip: Click Play to auto-step.</div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-4">
          <div className="p-2 bg-gray-800/40 rounded border border-gray-700 h-full overflow-auto">
            <ol className="text-xs space-y-1">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className={`p-1 rounded font-mono transition-colors ${i === Math.min(index, steps.length - 1) ? 'bg-cyan-900/50 text-cyan-300' : 'text-gray-400'}`}
                >
                  <div className="truncate">{s.description}</div>
                  {typeof s.address !== 'undefined' && (
                    <div className="text-[11px] text-gray-500">0x{s.address.toString(16).toUpperCase()}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
