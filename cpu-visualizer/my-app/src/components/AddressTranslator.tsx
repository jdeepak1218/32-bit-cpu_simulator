'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useCPUStore } from '@/lib/store';
import {
  extractVPN,
  extractPDIndex,
  extractPTIndex,
  extractOffset,
  PTE_PRESENT,
  PAGE_SIZE,
  PAGE_MASK,
  formatFlags,
} from '@/types/cpu';
import { Calculator, ArrowRight } from 'lucide-react';

export default function AddressTranslator() {
  const { mmu, cpu } = useCPUStore();
  const mmuState = mmu.getState();

  const [inputAddress, setInputAddress] = useState('');
  const [result, setResult] = useState<{
    vaddr: number;
    vpn: number;
    pdIndex: number;
    ptIndex: number;
    offset: number;
    paddr: number | null;
    flags: number | null;
    tlbHit: boolean;
    error?: string;
  } | null>(null);

  const translateAddress = () => {
    const vaddr = parseInt(inputAddress, 16) || parseInt(inputAddress, 10) || 0;

    if (!mmuState.pagingEnabled) {
      setResult({
        vaddr,
        vpn: 0,
        pdIndex: 0,
        ptIndex: 0,
        offset: 0,
        paddr: vaddr,
        flags: null,
        tlbHit: false,
        error: 'Paging is disabled',
      });
      return;
    }

    const vpn = extractVPN(vaddr);
    const pdIndex = extractPDIndex(vaddr);
    const ptIndex = extractPTIndex(vaddr);
    const offset = extractOffset(vaddr);

    // Check TLB
    const tlbEntry = mmuState.tlb.find((e) => e.valid && e.vpn === vpn);

    if (tlbEntry) {
      setResult({
        vaddr,
        vpn,
        pdIndex,
        ptIndex,
        offset,
        paddr: tlbEntry.paddr | offset,
        flags: tlbEntry.flags,
        tlbHit: true,
      });
      return;
    }

    // Walk page table
    const pdeAddr = mmuState.cr3 + pdIndex * 4;
    const pde =
      (mmuState.physMem[pdeAddr]) |
      (mmuState.physMem[pdeAddr + 1] << 8) |
      (mmuState.physMem[pdeAddr + 2] << 16) |
      (mmuState.physMem[pdeAddr + 3] << 24);

    if (!(pde & PTE_PRESENT)) {
      setResult({
        vaddr,
        vpn,
        pdIndex,
        ptIndex,
        offset,
        paddr: null,
        flags: null,
        tlbHit: false,
        error: 'Page Directory Entry not present (Page Fault)',
      });
      return;
    }

    const ptBase = pde & PAGE_MASK;
    const pteAddr = ptBase + ptIndex * 4;
    const pte =
      (mmuState.physMem[pteAddr]) |
      (mmuState.physMem[pteAddr + 1] << 8) |
      (mmuState.physMem[pteAddr + 2] << 16) |
      (mmuState.physMem[pteAddr + 3] << 24);

    if (!(pte & PTE_PRESENT)) {
      setResult({
        vaddr,
        vpn,
        pdIndex,
        ptIndex,
        offset,
        paddr: null,
        flags: null,
        tlbHit: false,
        error: 'Page Table Entry not present (Page Fault)',
      });
      return;
    }

    const paddr = (pte & PAGE_MASK) | offset;

    setResult({
      vaddr,
      vpn,
      pdIndex,
      ptIndex,
      offset,
      paddr,
      flags: pte & 0xFFF,
      tlbHit: false,
    });
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-850 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Calculator size={18} className="text-cyan-400 neon-cyan" />
          <h2 className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Address Translation Calculator
          </h2>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
            placeholder="Enter virtual address (hex or decimal)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
          />
          <button
            onClick={translateAddress}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-medium transition-colors"
          >
            Translate
          </button>
        </div>

        {/* Binary Breakdown */}
        {result && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Virtual Address Breakdown</h3>
              <div className="font-mono text-xs overflow-x-auto">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-gray-500">VA:</span>
                  <span className="text-cyan-400">
                    0x{result.vaddr.toString(16).padStart(8, '0').toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px]">
                  {(() => {
                    const bits = result.vaddr.toString(2).padStart(32, '0');
                    return (
                      <>
                        <span className="text-amber-400 font-bold">{bits.slice(0, 10)}</span>
                        <span className="text-green-400 font-bold">{bits.slice(10, 20)}</span>
                        <span className="text-blue-400 font-bold">{bits.slice(20, 32)}</span>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-4 mt-2 text-[10px]">
                  <span className="text-amber-400">PD Index (bits 31-22): {result.pdIndex}</span>
                  <span className="text-green-400">PT Index (bits 21-12): {result.ptIndex}</span>
                  <span className="text-blue-400">Offset (bits 11-0): {result.offset}</span>
                </div>
              </div>
            </div>

            {/* VPN and Offset */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-xs text-gray-500">VPN (Virtual Page Number)</div>
                <div className="text-sm font-mono text-cyan-400">
                  {result.vpn}
                </div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-xs text-gray-500">Page Offset</div>
                <div className="text-sm font-mono text-blue-400">
                  {result.offset} (0x{result.offset.toString(16)})
                </div>
              </div>
            </div>

            {/* Translation Result */}
            <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Translation Result</h3>

              {result.error ? (
                <div className="text-red-400 text-sm">{result.error}</div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">TLB:</span>
                    <span className={`text-sm font-medium ${
                      result.tlbHit ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {result.tlbHit ? 'HIT' : 'MISS'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Physical Address:</span>
                    <span className="text-sm font-mono text-green-400">
                      0x{result.paddr?.toString(16).padStart(8, '0').toUpperCase()}
                    </span>
                  </div>

                  {result.flags !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">PTE Flags:</span>
                      <span className="text-sm font-mono text-amber-400">
                        {formatFlags(result.flags)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-3 text-xs text-gray-500">
                    <span>VA 0x{result.vaddr.toString(16).padStart(8, '0').toUpperCase()}</span>
                    <ArrowRight size={14} className="text-gray-600" />
                    <span className="text-green-400">
                      PA 0x{result.paddr?.toString(16).padStart(8, '0').toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            <span className="text-amber-400 font-bold">PD Index</span>: Selects Page Directory Entry
            <span className="mx-2">|</span>
            <span className="text-green-400 font-bold">PT Index</span>: Selects Page Table Entry
            <span className="mx-2">|</span>
            <span className="text-blue-400 font-bold">Offset</span>: Byte offset within page
          </div>
        </div>
      </div>
    </div>
  );
}
