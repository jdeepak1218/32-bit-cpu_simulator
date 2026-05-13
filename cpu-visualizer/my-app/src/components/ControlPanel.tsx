'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useCPUStore } from '@/lib/store';
import {
  Sliders,
  Zap,
  Clock,
  Activity,
  Cpu,
  MemoryStick,
} from 'lucide-react';

export default function ControlPanel() {
  const {
    cpu,
    mmu,
    executionSpeed,
    setExecutionSpeed,
    instructionCount,
    isRunning,
    isPaused,
    enablePaging,
    reset,
  } = useCPUStore();

  const cpuState = cpu.getState();
  const mmuState = mmu.getState();

  const totalAccesses = mmuState.tlbHits + mmuState.tlbMisses;
  const tlbHitRate = totalAccesses > 0
    ? ((mmuState.tlbHits / totalAccesses) * 100).toFixed(1)
    : '0.0';

  const speedPresets = [1, 10, 100, 1000, 10000];

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-cyan-400 neon-cyan" />
          <h2 className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Control Panel</h2>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* CPU Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gradient-to-br from-gray-800/60 to-gray-800/30 rounded-lg border border-gray-700/60 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Cpu size={14} className="text-cyan-400 neon-cyan" />
              <span className="text-xs text-gray-500">CPU Status</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                cpuState.halted ? 'bg-red-500 shadow-lg shadow-red-500/40' : isRunning ? 'bg-green-500 shadow-lg shadow-green-500/40' : 'bg-yellow-500 shadow-lg shadow-yellow-500/40'
              }`} />
              <span className={`text-sm font-mono font-bold tracking-wide ${
                cpuState.halted ? 'text-red-400 neon-red' : isRunning ? 'text-green-400 neon-green' : 'text-yellow-400 neon-amber'
              }`}>
                {cpuState.halted ? 'HALTED' : isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : 'READY'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-br from-gray-800/60 to-gray-800/30 rounded-lg border border-gray-700/60 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <MemoryStick size={14} className="text-amber-400 neon-amber" />
              <span className="text-xs text-gray-500">Paging</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                mmuState.pagingEnabled ? 'bg-green-500 shadow-lg shadow-green-500/40 animate-pulse' : 'bg-gray-600'
              }`} />
              <span className={`text-sm font-mono font-bold tracking-wide ${
                mmuState.pagingEnabled ? 'text-green-400 neon-green' : 'text-gray-500'
              }`}>
                {mmuState.pagingEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>
        </div>

        {/* Execution Speed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <span className="text-xs text-gray-500">Execution Speed</span>
            </div>
            <span className="text-sm font-mono text-amber-400 font-semibold">
              {executionSpeed < 1000 ? `${executionSpeed} Hz` : `${(executionSpeed / 1000).toFixed(1)} kHz`}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={10000}
            step={1}
            value={executionSpeed}
            onChange={(e) => setExecutionSpeed(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />

          <div className="flex gap-1.5">
            {speedPresets.map((speed) => (
              <button
                key={speed}
                onClick={() => setExecutionSpeed(speed)}
                className={`flex-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
                  executionSpeed === speed
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {speed < 1000 ? `${speed}Hz` : `${(speed / 1000).toFixed(0)}kHz`}
              </button>
            ))}
          </div>
        </div>

        {/* Statistics */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-green-400" />
            <span className="text-xs text-gray-500">Statistics</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gradient-to-br from-emerald-900/20 to-emerald-800/5 rounded border border-emerald-700/30 shadow-sm">
              <div className="text-[10px] text-gray-500">Instructions</div>
              <div className="text-sm font-mono text-emerald-400 font-semibold">{instructionCount}</div>
            </div>
            <div className="p-2 bg-gradient-to-br from-cyan-900/20 to-cyan-800/5 rounded border border-cyan-700/30 shadow-sm">
              <div className="text-[10px] text-gray-500">Cycles</div>
              <div className="text-sm font-mono text-cyan-400 font-semibold">{cpuState.cycles.toString()}</div>
            </div>
            <div className="p-2 bg-gradient-to-br from-amber-900/20 to-amber-800/5 rounded border border-amber-700/30 shadow-sm">
              <div className="text-[10px] text-gray-500">TLB Hit Rate</div>
              <div className={`text-sm font-mono font-semibold ${
                parseFloat(tlbHitRate) > 80 ? 'text-emerald-400' : 'text-amber-400'
              }`}>{tlbHitRate}%</div>
            </div>
            <div className="p-2 bg-gradient-to-br from-red-900/20 to-red-800/5 rounded border border-red-700/30 shadow-sm">
              <div className="text-[10px] text-gray-500">Page Faults</div>
              <div className="text-sm font-mono text-red-400 font-semibold">{mmuState.pageFaults}</div>
            </div>
          </div>
        </div>

        {/* Memory Stats */}
        <div className="p-3 bg-gradient-to-br from-purple-900/15 to-purple-800/5 rounded-lg border border-purple-700/30 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-purple-400 neon-purple" />
            <span className="text-xs text-gray-500">Memory Access</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Reads:</span>
              <span className="font-mono text-emerald-400 font-semibold">{mmuState.reads}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Writes:</span>
              <span className="font-mono text-blue-400 font-semibold">{mmuState.writes}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">TLB:</span>
              <span className="font-mono">
                <span className="text-emerald-400 font-semibold">{mmuState.tlbHits}</span>
                <span className="text-gray-600">/</span>
                <span className="text-rose-400 font-semibold">{mmuState.tlbMisses}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
