'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCPUStore } from '@/lib/store';
import type { ExecutionLogEntry } from '@/lib/store';
import { ScrollText, Trash2, Filter, ChevronDown, ChevronUp, Activity, Search, Download } from 'lucide-react';

function RegisterDiff({ before, after }: { before: Uint32Array; after: Uint32Array }) {
  const changed: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (before[i] !== after[i]) {
      changed.push(i);
    }
  }

  if (changed.length === 0) return <span className="text-gray-600">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {changed.map((reg) => (
        <span
          key={reg}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-cyan-900/40 border border-cyan-700/50 rounded text-[10px] font-mono"
          title={`R${reg}: 0x${before[reg].toString(16).padStart(8, '0').toUpperCase()} → 0x${after[reg].toString(16).padStart(8, '0').toUpperCase()}`}
        >
          <span className="text-cyan-400">R{reg}</span>
          <span className="text-gray-500">=</span>
          <span className="text-green-400">0x{after[reg].toString(16).padStart(8, '0').toUpperCase()}</span>
        </span>
      ))}
    </div>
  );
}

function FlagsDiff({ before, after }: { before: number; after: number }) {
  const getFlags = (f: number) => {
    const parts: string[] = [];
    if (f & 1) parts.push('Z');
    if (f & 2) parts.push('N');
    if (f & 4) parts.push('V');
    if (f & 8) parts.push('I');
    return parts;
  };

  const beforeFlags = getFlags(before);
  const afterFlags = getFlags(after);

  if (beforeFlags.join('') === afterFlags.join('')) {
    return <span className="text-gray-500">{afterFlags.join('') || '-'}</span>;
  }

  return (
    <div className="flex gap-0.5">
      <span className="text-gray-600">{beforeFlags.join('') || '-'}</span>
      <span className="text-gray-500">→</span>
      <span className="text-purple-400 font-bold">{afterFlags.join('') || '-'}</span>
    </div>
  );
}

type SortField = 'cycle' | 'pc' | 'instruction';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'memory' | 'register';

export default function ExecutionLog() {
  const { executionLog, clearExecutionLog, setHighlightedMemory, setHighlightedRegister } = useCPUStore();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('cycle');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executionLog.length, autoScroll]);

  const filteredAndSorted = useMemo(() => {
    const log = executionLog;
    let filtered = log;

    if (filterType !== 'all' || searchTerm) {
      filtered = log.filter((e) => {
        if (filterType === 'memory' && !e.memoryAccess) return false;
        if (filterType === 'register') {
          let changed = false;
          for (let i = 0; i < 16; i++) {
            if (e.registersBefore[i] !== e.registersAfter[i]) { changed = true; break; }
          }
          if (!changed) return false;
        }
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            e.instruction.toLowerCase().includes(term) ||
            e.machineCode.toLowerCase().includes(term) ||
            `0x${e.pc.toString(16)}`.includes(term)
          );
        }
        return true;
      });
    }

    if (sortField !== 'cycle' || sortDirection !== 'desc') {
      filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'cycle') cmp = Number(a.cycle - b.cycle);
        else if (sortField === 'pc') cmp = a.pc - b.pc;
        else cmp = a.instruction.localeCompare(b.instruction);
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [executionLog, filterType, searchTerm, sortField, sortDirection]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleExport = useCallback(() => {
    const csv = [
      'Cycle,PC,Instruction,Machine Code,SP,Flags,Memory Access',
      ...filteredAndSorted.map((e) =>
        [
          e.cycle.toString(),
          `0x${e.pc.toString(16).padStart(8, '0').toUpperCase()}`,
          `"${e.instruction}"`,
          e.machineCode,
          `0x${e.spAfter.toString(16).padStart(8, '0').toUpperCase()}`,
          (() => {
            const f = e.flagsAfter;
            return (f & 1 ? 'Z' : '') + (f & 2 ? 'N' : '') + (f & 4 ? 'V' : '') + (f & 8 ? 'I' : '') || '-';
          })(),
          e.memoryAccess ? `${e.memoryAccess.type} @0x${e.memoryAccess.vaddr.toString(16)}` : '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cpu-execution-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAndSorted]);

  const renderLogRow = useCallback((entry: ExecutionLogEntry, idx: number) => {
    return (
      <tr
        key={`${entry.cycle.toString()}-${idx}`}
        className="hover:bg-gray-800/50 transition-colors group"
      >
        <td className="px-3 py-2 font-mono text-[10px] text-gray-500 whitespace-nowrap">
          {entry.cycle.toString()}
        </td>
        <td className="px-3 py-2 font-mono text-[11px] text-amber-400 whitespace-nowrap">
          0x{entry.pc.toString(16).padStart(8, '0').toUpperCase()}
        </td>
        <td className="px-3 py-2 text-[11px] text-gray-300 font-medium whitespace-nowrap">
          {entry.instruction}
        </td>
        <td className="px-3 py-2 font-mono text-[10px] text-gray-500 whitespace-nowrap hidden lg:table-cell">
          {entry.machineCode}
        </td>
        <td className="px-3 py-2 text-[10px] max-w-[200px] hidden xl:table-cell">
          <RegisterDiff before={entry.registersBefore} after={entry.registersAfter} />
        </td>
        <td className="px-3 py-2 text-[10px]">
          {entry.memoryAccess ? (
            <button
              onClick={() => setHighlightedMemory(entry.memoryAccess!.vaddr, entry.memoryAccess!.paddr)}
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity ${
                entry.tlbHit
                  ? 'bg-green-900/30 border border-green-700/40 text-green-400'
                  : 'bg-amber-900/30 border border-amber-700/40 text-amber-400'
              }`}
              title={`${entry.tlbHit ? 'TLB Hit' : 'TLB Miss'} - ${entry.memoryAccess.type === 'read' ? 'Read' : 'Write'}`}
            >
              {entry.memoryAccess.type === 'read' ? 'R' : 'W'}
              <span>@</span>
              <span className="underline decoration-dotted">
                0x{entry.memoryAccess.vaddr.toString(16).padStart(4, '0').toUpperCase()}
              </span>
            </button>
          ) : (
            <span className="text-gray-600">-</span>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">
          <span className="text-blue-400">
            0x{entry.spAfter.toString(16).padStart(8, '0').toUpperCase()}
          </span>
        </td>
        <td className="px-3 py-2 text-[10px] whitespace-nowrap">
          <FlagsDiff before={entry.flagsBefore} after={entry.flagsAfter} />
        </td>
        <td className="px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              for (let i = 0; i < 16; i++) {
                if (entry.registersBefore[i] !== entry.registersAfter[i]) {
                  setHighlightedRegister(i);
                  break;
                }
              }
            }}
            className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
            title="Highlight changed register"
          >
            <Activity size={10} />
          </button>
        </td>
      </tr>
    );
  }, [setHighlightedMemory, setHighlightedRegister]);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-cyan-400">
              Execution Log
            </h2>
            <span className="text-xs text-gray-500 font-mono">
              ({filteredAndSorted.length}/{executionLog.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showFilters ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <Filter size={12} />
              Filter
            </button>
            <button
              onClick={handleExport}
              className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs transition-colors"
              title="Export as CSV"
            >
              <Download size={12} />
            </button>
            <button
              onClick={clearExecutionLog}
              className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs transition-colors"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700">
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search instructions, addresses..."
                className="w-full bg-gray-900 border border-gray-700 rounded pl-7 pr-2 py-1 text-xs text-gray-300 focus:border-cyan-500 outline-none"
              />
            </div>

            <div className="flex gap-1">
              {([
                { value: 'all', label: 'All' },
                { value: 'memory', label: 'Memory' },
                { value: 'register', label: 'Registers' },
              ] as { value: FilterType; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilterType(value)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    filterType === value
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                autoScroll ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              Auto-scroll
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto max-h-[400px]"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
          if (isAtBottom !== autoScroll) {
            setAutoScroll(isAtBottom);
          }
        }}
      >
        <table className="w-full text-xs">
          <thead className="bg-gray-900/95 sticky top-0 backdrop-blur-sm z-10 border-b border-gray-700">
            <tr>
              {[
                { field: 'cycle' as SortField, label: 'Cycle' },
                { field: 'pc' as SortField, label: 'PC' },
                { field: 'instruction' as SortField, label: 'Instruction' },
                { field: null as SortField | null, label: 'Machine Code', hideOn: 'lg' },
                { field: null as SortField | null, label: 'Registers Changed', hideOn: 'xl' },
                { field: null as SortField | null, label: 'Memory' },
                { field: null as SortField | null, label: 'SP' },
                { field: null as SortField | null, label: 'Flags' },
                { field: null as SortField | null, label: '' },
              ].map(({ field, label, hideOn }, i) => (
                <th
                  key={i}
                  className={`text-left px-3 py-2 text-gray-500 font-medium text-[10px] uppercase tracking-wider ${
                    field ? 'cursor-pointer hover:text-gray-300' : ''
                  } ${hideOn === 'lg' ? 'hidden lg:table-cell' : ''} ${hideOn === 'xl' ? 'hidden xl:table-cell' : ''}`}
                  onClick={() => field && toggleSort(field)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    {field && sortField === field && (
                      <span className="text-cyan-400">
                        {sortDirection === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <ScrollText size={24} className="text-gray-600" />
                    <span className="text-sm">No instructions executed yet</span>
                    <span className="text-xs text-gray-600">Click Run or Step to begin</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((entry, idx) => renderLogRow(entry, idx))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
