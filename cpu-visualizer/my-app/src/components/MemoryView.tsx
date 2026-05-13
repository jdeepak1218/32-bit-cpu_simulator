'use client';

import React, { useState, useMemo } from 'react';
import { useCPUStore } from '@/lib/store';
import {
  PAGE_SIZE,
  PAGE_MASK,
  extractVPN,
  extractOffset,
  extractPDIndex,
  extractPTIndex,
  formatFlags,
  PTE_PRESENT,
  PHYS_MEM_SIZE,
  FRAME_COUNT,
} from '@/types/cpu';

// Compact segment colors
const SEGMENT_COLORS: Record<string, string> = {
  code: 'bg-emerald-600',
  stack: 'bg-amber-500',
  heap: 'bg-purple-500',
  unmapped: 'bg-gray-800',
  highlighted: 'bg-cyan-400',
};

function getSegmentType(vaddr: number, isMapped: boolean): string {
  if (!isMapped) return 'unmapped';
  if (vaddr < 0x4000) return 'code';
  if (vaddr >= 0x3FF000) return 'stack';
  return 'heap';
}

export default function MemoryView() {
  const { cpu, mmu, highlightedMemoryVAddr, highlightedMemoryPAddr, setHighlightedMemory, setShowPageWalk, setCurrentPageWalkSteps } = useCPUStore();
  const cpuState = cpu.getState();
  const mmuState = mmu.getState();

  const [viewMode, setViewMode] = useState<'virtual' | 'physical' | 'hex'>('virtual');
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);

  // ---- Virtual memory map - compact grid of 32 pages ----
  const virtualPages = useMemo(() => {
    const pages: { vaddr: number; paddr: number | null; flags: number; isMapped: boolean }[] = [];
    for (let i = 0; i < 32; i++) {
      const vaddr = i * PAGE_SIZE;
      const pdIdx = extractPDIndex(vaddr);
      const ptIdx = extractPTIndex(vaddr);
      const pdeAddr = mmuState.cr3 + pdIdx * 4;
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

  // ---- Physical frame map ----
  const physicalFrames = useMemo(() => {
    const frames: { frameNum: number; isAllocated: boolean }[] = [];
    const frameBitmap = mmuState.frameBitmap;
    for (let i = 0; i < 32; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      frames.push({ frameNum: i, isAllocated: !!(frameBitmap[byteIdx] & (1 << bitIdx)) });
    }
    return frames;
  }, [mmuState.frameBitmap]);

  const handleSearch = () => {
    const addr = parseInt(searchAddress, 16) || parseInt(searchAddress, 10) || 0;
    const vpn = extractVPN(addr);
    setSelectedPage(vpn);
    setHighlightedMemory(addr, null);
  };

  const handlePageClick = (page: typeof virtualPages[number]) => {
    const vpn = extractVPN(page.vaddr);
    setSelectedPage(vpn);
    setHighlightedMemory(page.vaddr, page.paddr);
    try {
      const { steps } = mmu.pageTableWalk(page.vaddr, false, false);
      if (steps && steps.length) {
        setCurrentPageWalkSteps(steps);
        setShowPageWalk(true);
      }
    } catch (_) { /* ignore */ }
  };

  const handleFrameClick = (frame: typeof physicalFrames[number]) => {
    setSelectedFrame(frame.frameNum);
    setHighlightedMemory(null, frame.frameNum * PAGE_SIZE);
  };

  // ---- Render: Virtual View ----
  const renderVirtualView = () => (
    <div className="space-y-3">
      {/* Color legend */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        {['Code', 'Stack', 'Heap'].map((label) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded ${SEGMENT_COLORS[label.toLowerCase()]}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded ${SEGMENT_COLORS.unmapped}`} />
          Unmapped
        </span>
        <span className="text-gray-600">|</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded ${SEGMENT_COLORS.highlighted}`} />
          Selected
        </span>
      </div>

      {/* Compact memory map grid */}
      <div className="grid grid-cols-8 sm:grid-cols-8 md:grid-cols-16 gap-1">
        {virtualPages.map((page) => {
          const isHL = highlightedMemoryVAddr !== null &&
            extractVPN(highlightedMemoryVAddr) === extractVPN(page.vaddr);
          const segType = getSegmentType(page.vaddr, page.isMapped);
          const colorClass = isHL ? SEGMENT_COLORS.highlighted : SEGMENT_COLORS[segType];
          return (
            <button
              key={page.vaddr}
              onClick={() => handlePageClick(page)}
              title={`VPN ${extractVPN(page.vaddr)} | VA: 0x${page.vaddr.toString(16).padStart(8, '0').toUpperCase()}${page.isMapped ? ` | PA: 0x${page.paddr!.toString(16).padStart(8, '0').toUpperCase()}` : ' | Unmapped'}`}
              className={`aspect-square rounded cursor-pointer transition-all hover:opacity-80 hover:scale-110 ${colorClass} ${isHL ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-gray-900' : ''}`}
            />
          );
        })}
      </div>

      {/* Page labels */}
      <div className="grid grid-cols-8 sm:grid-cols-8 md:grid-cols-16 gap-1 text-[9px] font-mono text-gray-600 text-center">
        {virtualPages.map((page) => (
          <span key={page.vaddr}>{extractVPN(page.vaddr)}</span>
        ))}
      </div>

      {/* Detail panel for selected page */}
      {selectedPage >= 0 && virtualPages[selectedPage] && (
        <div className="p-3 bg-gray-800/80 rounded border border-gray-700 text-xs space-y-1.5 transition-all">
          <div className="text-cyan-400 font-semibold mb-2">Page VPN {selectedPage}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-500">Virtual Addr:</span>
            <span className="font-mono text-gray-200">0x{virtualPages[selectedPage].vaddr.toString(16).padStart(8, '0').toUpperCase()}</span>

            <span className="text-gray-500">Physical Addr:</span>
            <span className="font-mono text-gray-200">
              {virtualPages[selectedPage].paddr
                ? `0x${virtualPages[selectedPage].paddr.toString(16).padStart(8, '0').toUpperCase()}`
                : <span className="text-red-400">Unmapped</span>}
            </span>

            {virtualPages[selectedPage].isMapped && (
              <>
                <span className="text-gray-500">Flags:</span>
                <span className="font-mono text-amber-400">{formatFlags(virtualPages[selectedPage].flags)}</span>
              </>
            )}

            <span className="text-gray-500">PD Index:</span>
            <span className="font-mono text-gray-400">{extractPDIndex(virtualPages[selectedPage].vaddr)}</span>

            <span className="text-gray-500">PT Index:</span>
            <span className="font-mono text-gray-400">{extractPTIndex(virtualPages[selectedPage].vaddr)}</span>

            <span className="text-gray-500">Offset:</span>
            <span className="font-mono text-gray-400">0x{extractOffset(virtualPages[selectedPage].vaddr).toString(16)}</span>
          </div>
        </div>
      )}
    </div>
  );

  // ---- Render: Physical View ----
  const renderPhysicalView = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-600" />
          Allocated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-gray-800 border border-gray-700" />
          Free
        </span>
      </div>

      <div className="grid grid-cols-8 gap-1">
        {physicalFrames.map((frame) => {
          const isHL = highlightedMemoryPAddr !== null &&
            Math.floor(highlightedMemoryPAddr / PAGE_SIZE) === frame.frameNum;
          return (
            <button
              key={frame.frameNum}
              onClick={() => handleFrameClick(frame)}
              title={`Frame ${frame.frameNum} | 0x${(frame.frameNum * PAGE_SIZE).toString(16).padStart(8, '0').toUpperCase()} | ${frame.isAllocated ? 'Allocated' : 'Free'}`}
              className={`aspect-square rounded cursor-pointer transition-all hover:opacity-80 hover:scale-110 ${
                isHL
                  ? 'bg-cyan-500 ring-2 ring-cyan-300 ring-offset-1 ring-offset-gray-900'
                  : frame.isAllocated
                    ? 'bg-emerald-700'
                    : 'bg-gray-800 border border-gray-700'
              }`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-8 gap-1 text-[9px] font-mono text-gray-600 text-center">
        {physicalFrames.map((frame) => (
          <span key={frame.frameNum}>{frame.frameNum}</span>
        ))}
      </div>

      {selectedFrame !== null && (
        <div className="p-3 bg-gray-800/80 rounded border border-gray-700 text-xs space-y-1.5">
          <div className="text-emerald-400 font-semibold mb-2">Frame {selectedFrame}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-500">Physical Addr:</span>
            <span className="font-mono text-gray-200">0x{(selectedFrame * PAGE_SIZE).toString(16).padStart(8, '0').toUpperCase()}</span>
            <span className="text-gray-500">Status:</span>
            <span className={physicalFrames[selectedFrame]?.isAllocated ? 'text-green-400' : 'text-gray-500'}>
              {physicalFrames[selectedFrame]?.isAllocated ? 'Allocated' : 'Free'}
            </span>
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-600">
        Frames: {FRAME_COUNT.toLocaleString()} | Size: {PAGE_SIZE.toLocaleString()} B
      </div>
    </div>
  );

  // ---- Render: Hex View ----
  const renderHexView = () => {
    const baseAddr = selectedPage * PAGE_SIZE;
    const bytes: { addr: number; value: number }[] = [];
    for (let i = 0; i < 64; i++) {
      const addr = baseAddr + i;
      if (mmuState.pagingEnabled) {
        const result = mmu.translate(addr, false, false);
        if (!result.pageFault) {
          bytes.push({ addr, value: mmuState.physMem[result.paddr] });
        } else {
          bytes.push({ addr, value: 0 });
        }
      } else {
        bytes.push({ addr, value: mmuState.physMem[addr] });
      }
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Page VPN:</span>
          <input
            type="number"
            value={selectedPage}
            onChange={(e) => setSelectedPage(parseInt(e.target.value) || 0)}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
          />
          <span className="text-[10px] text-gray-600">0x{baseAddr.toString(16).padStart(8, '0').toUpperCase()}</span>
        </div>

        <div className="font-mono text-[10px] leading-relaxed">
          {/* Header */}
          <div className="grid grid-cols-[auto_repeat(16,1fr)] gap-x-1 mb-1">
            <div className="text-gray-600 pr-2">Addr</div>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="text-center text-gray-600">{i.toString(16).toUpperCase()}</div>
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 4 }, (_, row) => (
            <div key={row} className="grid grid-cols-[auto_repeat(16,1fr)] gap-x-1">
              <div className="text-gray-500 pr-2">
                {(baseAddr + row * 16).toString(16).padStart(8, '0').toUpperCase()}
              </div>
              {Array.from({ length: 16 }, (_, col) => {
                const idx = row * 16 + col;
                const byte = bytes[idx];
                const isHL = highlightedMemoryVAddr !== null && highlightedMemoryVAddr === byte?.addr;
                return (
                  <div
                    key={col}
                    onClick={() => byte && setHighlightedMemory(byte.addr, null)}
                    className={`text-center cursor-pointer rounded transition-colors hover:bg-gray-700 ${
                      isHL ? 'bg-cyan-900/70 text-cyan-300 font-semibold' : 'text-gray-400'
                    }`}
                  >
                    {byte?.value.toString(16).padStart(2, '0').toUpperCase()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-cyan-400">Memory</h2>
        <div className="flex items-center gap-0.5 bg-gray-900 rounded text-xs">
          {(['virtual', 'physical', 'hex'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 rounded transition-colors ${
                viewMode === mode
                  ? 'bg-cyan-600 text-white font-medium'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-800 flex gap-2">
        <input
          type="text"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
          placeholder="Address (hex)"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:border-cyan-500 outline-none"
        />
        <button
          onClick={handleSearch}
          className="px-2 py-1 text-xs text-gray-400 hover:text-cyan-400 bg-gray-800 rounded border border-gray-700 transition-colors"
        >
          Go
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {viewMode === 'virtual' && renderVirtualView()}
        {viewMode === 'physical' && renderPhysicalView()}
        {viewMode === 'hex' && renderHexView()}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-800/50 border-t border-gray-800 flex items-center gap-3 text-[10px] text-gray-600">
        <span className="text-emerald-400 font-mono">{(PHYS_MEM_SIZE / 1024 / 1024)}MB</span>
        <span>{PAGE_SIZE}B pages</span>
        <span className={mmuState.pagingEnabled ? 'text-green-400' : ''}>
          Paging: {mmuState.pagingEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="text-amber-400 font-mono">CR3: 0x{mmuState.cr3.toString(16).padStart(8, '0').toUpperCase()}</span>
      </div>
    </div>
  );
}
