'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useCPUStore } from '@/lib/store';
import {
  PAGE_SIZE,
  PAGE_MASK,
  PHYS_MEM_SIZE,
  FRAME_COUNT,
  extractVPN,
  extractOffset,
  extractPDIndex,
  extractPTIndex,
  formatFlags,
  PTE_PRESENT,
  PTE_WRITABLE,
  PTE_USER,
  PTE_DIRTY,
  PTE_ACCESSED,
} from '@/types/cpu';
import { Search, Layers, Grid3X3 } from 'lucide-react';

// Memory segment colors
const SEGMENT_COLORS = {
  code: { bg: 'bg-emerald-900/40', border: 'border-emerald-500/50', text: 'text-emerald-400' },
  data: { bg: 'bg-blue-900/40', border: 'border-blue-500/50', text: 'text-blue-400' },
  stack: { bg: 'bg-amber-900/40', border: 'border-amber-500/50', text: 'text-amber-400' },
  heap: { bg: 'bg-purple-900/40', border: 'border-purple-500/50', text: 'text-purple-400' },
  unmapped: { bg: 'bg-gray-800/40', border: 'border-gray-600/50', text: 'text-gray-500' },
  highlighted: { bg: 'bg-cyan-900/60', border: 'border-cyan-400', text: 'text-cyan-300' },
};

interface MemoryCellProps {
  address: number;
  value: number;
  isHighlighted?: boolean;
  onClick?: () => void;
}

function MemoryCell({ address, value, isHighlighted, onClick }: MemoryCellProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      onClick={onClick}
      className={`w-3 h-3 rounded-sm cursor-pointer transition-colors ${
        isHighlighted ? 'bg-cyan-400 shadow-lg shadow-cyan-400/50' : 'bg-gray-700 hover:bg-gray-600'
      }`}
      title={`0x${address.toString(16).padStart(8, '0').toUpperCase()}: 0x${value.toString(16).padStart(2, '0').toUpperCase()}`}
    />
  );
}

interface PageBlockProps {
  vaddr: number;
  paddr: number | null;
  isMapped: boolean;
  flags: number;
  isHighlighted: boolean;
  onClick: () => void;
}

function PageBlock({ vaddr, paddr, isMapped, flags, isHighlighted, onClick }: PageBlockProps) {
  let segmentType: keyof typeof SEGMENT_COLORS = 'unmapped';

  if (isMapped) {
    if (vaddr < 0x4000) {
      segmentType = 'code';
    } else if (vaddr >= 0x3FF000) {
      segmentType = 'stack';
    } else {
      segmentType = 'heap';
    }
  }

  const colors = SEGMENT_COLORS[segmentType];

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
      className={`relative p-2 rounded border ${colors.bg} ${colors.border} ${
        isHighlighted ? `ring-2 ring-cyan-400 ${SEGMENT_COLORS.highlighted.bg}` : ''
      } cursor-pointer transition-all`}
    >
      <div className="text-xs font-mono text-gray-400">
        VPN 0x{extractVPN(vaddr).toString(16).toUpperCase()}
      </div>
      <div className={`text-xs font-mono ${colors.text}`}>
        VA: 0x{vaddr.toString(16).padStart(8, '0').toUpperCase().slice(0, 6)}...
      </div>
      {isMapped ? (
        <>
          <div className="text-xs font-mono text-gray-500">
            PA: 0x{paddr?.toString(16).padStart(8, '0').toUpperCase().slice(0, 6)}...
          </div>
          <div className="text-xs font-mono text-gray-600 mt-1">
            {formatFlags(flags)}
          </div>
        </>
      ) : (
        <div className="text-xs font-mono text-gray-600">Unmapped</div>
      )}
    </motion.div>
  );
}

interface FrameBlockProps {
  frameNum: number;
  isAllocated: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}

function FrameBlock({ frameNum, isAllocated, isHighlighted, onClick }: FrameBlockProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
      className={`p-2 rounded border cursor-pointer transition-all ${
        isAllocated
          ? 'bg-emerald-900/40 border-emerald-500/50'
          : 'bg-gray-800/40 border-gray-600/50'
      } ${isHighlighted ? 'ring-2 ring-cyan-400 bg-cyan-900/60' : ''}`}
    >
      <div className="text-xs font-mono text-gray-400">
        Frame {frameNum}
      </div>
      <div className={`text-xs font-mono ${isAllocated ? 'text-emerald-400' : 'text-gray-600'}`}>
        0x{(frameNum * PAGE_SIZE).toString(16).padStart(8, '0').toUpperCase()}
      </div>
      <div className="text-xs font-mono text-gray-600 mt-1">
        {isAllocated ? 'Allocated' : 'Free'}
      </div>
    </motion.div>
  );
}

export default function MemoryView() {
  const { cpu, mmu, highlightedMemoryVAddr, highlightedMemoryPAddr, setHighlightedMemory, setShowPageWalk, setCurrentPageWalkSteps } = useCPUStore();
  const cpuState = cpu.getState();
  const mmuState = mmu.getState();

  const [viewMode, setViewMode] = useState<'virtual' | 'physical' | 'hex'>('virtual');
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedPage, setSelectedPage] = useState(0);

  // Build virtual memory map
  const virtualPages = useMemo(() => {
    const pages: { vaddr: number; paddr: number | null; flags: number; isMapped: boolean }[] = [];

    // Check first 16 pages for display
    for (let i = 0; i < 32; i++) {
      const vaddr = i * PAGE_SIZE;
      const pdIdx = extractPDIndex(vaddr);
      const ptIdx = extractPTIndex(vaddr);
      const pdeAddr = mmuState.cr3 + pdIdx * 4;

      // Read PDE
      const pde =
        (mmuState.physMem[pdeAddr]) |
        (mmuState.physMem[pdeAddr + 1] << 8) |
        (mmuState.physMem[pdeAddr + 2] << 16) |
        (mmuState.physMem[pdeAddr + 3] << 24);

      let paddr: number | null = null;
      let flags = 0;
      let isMapped = false;

      if (pde & PTE_PRESENT) {
        const ptBase = pde & PAGE_MASK;
        const pteAddr = ptBase + ptIdx * 4;
        const pte =
          (mmuState.physMem[pteAddr]) |
          (mmuState.physMem[pteAddr + 1] << 8) |
          (mmuState.physMem[pteAddr + 2] << 16) |
          (mmuState.physMem[pteAddr + 3] << 24);

        if (pte & PTE_PRESENT) {
          paddr = pte & PAGE_MASK;
          flags = pte & 0xFFF;
          isMapped = true;
        }
      }

      pages.push({ vaddr, paddr, flags, isMapped });
    }

    return pages;
  }, [mmuState.physMem, mmuState.cr3]);

  // Build physical frame map
  const physicalFrames = useMemo(() => {
    const frames: { frameNum: number; isAllocated: boolean }[] = [];
    const frameBitmap = mmuState.frameBitmap;

    // Show first 32 frames
    for (let i = 0; i < 32; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      const isAllocated = !!(frameBitmap[byteIdx] & (1 << bitIdx));
      frames.push({ frameNum: i, isAllocated });
    }

    return frames;
  }, [mmuState.frameBitmap]);

  const handleSearch = () => {
    const addr = parseInt(searchAddress, 16) || parseInt(searchAddress, 10) || 0;
    const vpn = extractVPN(addr);
    setSelectedPage(vpn);
    setHighlightedMemory(addr, null);
  };

  const renderVirtualView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-emerald-900/40 border border-emerald-500/50"></div>
          <span className="text-gray-400">Code</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-blue-900/40 border border-blue-500/50"></div>
          <span className="text-gray-400">Data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-amber-900/40 border border-amber-500/50"></div>
          <span className="text-gray-400">Stack</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-purple-900/40 border border-purple-500/50"></div>
          <span className="text-gray-400">Heap</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-800 border border-gray-600"></div>
          <span className="text-gray-400">Unmapped</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {virtualPages.map((page) => (
          <PageBlock
            key={page.vaddr}
            {...page}
            isHighlighted={highlightedMemoryVAddr !== null &&
              extractVPN(highlightedMemoryVAddr) === extractVPN(page.vaddr)}
            onClick={() => {
              setHighlightedMemory(page.vaddr, page.paddr);
              setSelectedPage(extractVPN(page.vaddr));
              // Trigger a translation to produce page-walk steps and show the walker UI
              try {
                const { steps } = mmu.pageTableWalk(page.vaddr, false, false);
                if (steps && steps.length) {
                  setCurrentPageWalkSteps(steps);
                  setShowPageWalk(true);
                }
              } catch (e) {
                // ignore translation errors here
              }
            }}
          />
        ))}
      </div>

      {/* Page Details */}
      {selectedPage >= 0 && virtualPages[selectedPage] && (
        <div className="mt-4 p-3 bg-gray-800/50 rounded border border-gray-700">
          <h4 className="text-xs font-semibold text-cyan-400 mb-2">Page Details (VPN {selectedPage})</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-gray-500">Virtual Address:</div>
            <div className="font-mono text-gray-300">
              0x{virtualPages[selectedPage].vaddr.toString(16).padStart(8, '0').toUpperCase()}
            </div>
            <div className="text-gray-500">Physical Address:</div>
            <div className="font-mono text-gray-300">
              {virtualPages[selectedPage].paddr
                ? `0x${virtualPages[selectedPage].paddr.toString(16).padStart(8, '0').toUpperCase()}`
                : 'Unmapped'}
            </div>
            <div className="text-gray-500">Flags:</div>
            <div className="font-mono text-gray-300">
              {formatFlags(virtualPages[selectedPage].flags)}
            </div>
            <div className="text-gray-500">PD Index:</div>
            <div className="font-mono text-gray-300">{extractPDIndex(virtualPages[selectedPage].vaddr)}</div>
            <div className="text-gray-500">PT Index:</div>
            <div className="font-mono text-gray-300">{extractPTIndex(virtualPages[selectedPage].vaddr)}</div>
            <div className="text-gray-500">Offset:</div>
            <div className="font-mono text-gray-300">{extractOffset(virtualPages[selectedPage].vaddr).toString(16)}</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPhysicalView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-emerald-900/40 border border-emerald-500/50"></div>
          <span className="text-gray-400">Allocated</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-800 border border-gray-600"></div>
          <span className="text-gray-400">Free</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {physicalFrames.map((frame) => (
          <FrameBlock
            key={frame.frameNum}
            {...frame}
            isHighlighted={highlightedMemoryPAddr !== null &&
              Math.floor(highlightedMemoryPAddr / PAGE_SIZE) === frame.frameNum}
            onClick={() => setHighlightedMemory(null, frame.frameNum * PAGE_SIZE)}
          />
        ))}
      </div>

      <div className="text-xs text-gray-500 mt-4">
        Total Frames: {FRAME_COUNT.toLocaleString()} | Frame Size: {PAGE_SIZE.toLocaleString()} bytes
      </div>
    </div>
  );

  const renderHexView = () => {
    const baseAddr = selectedPage * PAGE_SIZE;
    const bytes: { addr: number; value: number }[] = [];

    for (let i = 0; i < 64; i++) {
      const addr = baseAddr + i;
      if (mmuState.pagingEnabled) {
        const { paddr } = mmu.translate(addr, false, false);
        bytes.push({ addr, value: mmuState.physMem[paddr] });
      } else {
        bytes.push({ addr, value: mmuState.physMem[addr] });
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">Page:</span>
          <input
            type="number"
            value={selectedPage}
            onChange={(e) => setSelectedPage(parseInt(e.target.value) || 0)}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
          />
        </div>

        <div className="font-mono text-xs">
          <div className="grid grid-cols-17 gap-1">
            <div className="text-gray-600">Address</div>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="text-center text-gray-600">
                +{i.toString(16).toUpperCase()}
              </div>
            ))}
          </div>

          {Array.from({ length: 4 }, (_, row) => (
            <div key={row} className="grid grid-cols-17 gap-1">
              <div className="text-gray-500">
                {(baseAddr + row * 16).toString(16).padStart(8, '0').toUpperCase()}
              </div>
              {Array.from({ length: 16 }, (_, col) => {
                const idx = row * 16 + col;
                const byte = bytes[idx];
                return (
                  <motion.div
                    key={col}
                    className={`text-center cursor-pointer hover:bg-gray-700 rounded ${
                      highlightedMemoryVAddr === byte?.addr ? 'bg-cyan-900/50 text-cyan-400' : 'text-gray-400'
                    }`}
                    onClick={() => setHighlightedMemory(byte?.addr, null)}
                  >
                    {byte?.value.toString(16).padStart(2, '0').toUpperCase()}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Memory
          </h2>

          <div className="flex items-center gap-1 bg-gray-900 rounded p-1">
            {[
              { mode: 'virtual', icon: Layers, label: 'Virtual' },
              { mode: 'physical', icon: Grid3X3, label: 'Physical' },
              { mode: 'hex', icon: Search, label: 'Hex' },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as typeof viewMode)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  viewMode === mode
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            placeholder="Search address (hex)"
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1 text-xs text-gray-300 focus:border-cyan-500 outline-none"
          />
          <button
            onClick={handleSearch}
            className="p-1 text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === 'virtual' && renderVirtualView()}
        {viewMode === 'physical' && renderPhysicalView()}
        {viewMode === 'hex' && renderHexView()}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 bg-gradient-to-r from-gray-800/40 to-gray-800/20 border-t border-gray-700">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="text-emerald-400">Physical: {(PHYS_MEM_SIZE / 1024 / 1024)}MB</span>
          <span className="text-cyan-400">Page Size: {PAGE_SIZE}B</span>
          <span className={mmuState.pagingEnabled ? 'text-green-400' : 'text-gray-500'}>Paging: {mmuState.pagingEnabled ? 'ON' : 'OFF'}</span>
          <span className="text-amber-400">CR3: 0x{mmuState.cr3.toString(16).padStart(8, '0').toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
