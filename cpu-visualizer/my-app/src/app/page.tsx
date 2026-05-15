'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useCPUStore } from '@/lib/store';
import { Cpu, MemoryStick, Globe, Terminal } from 'lucide-react';

const AssemblyEditor = dynamic(() => import('@/components/AssemblyEditor'), { ssr: false });
const RegisterFile = dynamic(() => import('@/components/RegisterFile'), { ssr: false });
const MemoryView = dynamic(() => import('@/components/MemoryView'), { ssr: false });
const TLBView = dynamic(() => import('@/components/TLBView'), { ssr: false });
const ExecutionLog = dynamic(() => import('@/components/ExecutionLog'), { ssr: false });
const AddressTranslator = dynamic(() => import('@/components/AddressTranslator'), { ssr: false });
const PageWalk = dynamic(() => import('@/components/PageWalk'), { ssr: false });
const PageFaultNotification = dynamic(() => import('@/components/PageFaultNotification'), { ssr: false });
const ControlPanel = dynamic(() => import('@/components/ControlPanel'), { ssr: false });

export default function Home() {
  const { assemblyErrors } = useCPUStore();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <PageFaultNotification />

      <header className="bg-gradient-to-r from-gray-900 via-gray-900/95 to-gray-900 border-b border-gray-800/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-purple-500/20 rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                <Cpu size={24} className="text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  32-bit CPU Visualizer
                </h1>
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    Interactive emulator
                  </span>
                  <span className="w-1 h-1 rounded-full bg-gray-700" />
                  <span>Paging &amp; TLB</span>
                  <span className="w-1 h-1 rounded-full bg-gray-700" />
                  <span>35 instructions</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border border-emerald-700/40 rounded-lg shadow-lg shadow-emerald-900/10">
                  <MemoryStick size={14} className="text-emerald-400" />
                  <div>
                    <div className="text-gray-500">Physical</div>
                    <div className="font-mono text-emerald-400 font-semibold">64 MB</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-br from-amber-900/30 to-amber-800/10 border border-amber-700/40 rounded-lg shadow-lg shadow-amber-900/10">
                  <Globe size={14} className="text-amber-400" />
                  <div>
                    <div className="text-gray-500">Virtual</div>
                    <div className="font-mono text-amber-400 font-semibold">4 GB</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-gradient-to-br from-cyan-900/20 to-blue-900/10 rounded-lg border border-cyan-700/30 shadow-lg shadow-cyan-900/10">
                  <div className="flex items-center gap-2 text-xs text-cyan-300">
                    <Terminal size={12} />
                    <span className="font-semibold">Assembly</span>
                  </div>
                </div>
                {assemblyErrors.length > 0 && (
                  <div className="px-3 py-1.5 bg-red-900/30 border border-red-700/40 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-red-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {assemblyErrors.length} error{assemblyErrors.length > 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
            <div className="flex-1 min-h-[400px] lg:min-h-[600px]">
              <AssemblyEditor />
            </div>
            <ControlPanel />
          </div>

          <div className="col-span-12 lg:col-span-5 space-y-5">
            <RegisterFile />
            <PageWalk />
            <MemoryView />
          </div>

          <div className="col-span-12 lg:col-span-3 space-y-5">
            <TLBView />
            <AddressTranslator />
            <ExecutionLog />
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800/30 mt-8 bg-gradient-to-t from-gray-900/50 to-transparent">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span className="text-gray-600">32-bit CPU Visualizer</span>
              <span className="w-1 h-1 rounded-full bg-gray-800" />
              <span className="text-gray-600">Based on original C implementation</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-600">16 registers, 2-level paging</span>
              <span className="hidden sm:inline text-gray-600">4KB pages</span>
              <span className="hidden md:inline text-gray-600">64-entry FIFO TLB</span>
              <span className="hidden lg:inline text-gray-600">32-bit fixed instr</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
