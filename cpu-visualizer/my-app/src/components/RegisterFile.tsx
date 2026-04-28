'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCPUStore } from '@/lib/store';
import {
  formatCPUFlags,
  FLAG_ZERO,
  FLAG_NEGATIVE,
  FLAG_OVERFLOW,
  FLAG_INTERRUPT,
} from '@/types/cpu';

interface RegisterCardProps {
  index: number;
  value: number;
  isHighlighted: boolean;
  isSpecial?: boolean;
  label?: string;
}

function RegisterCard({ index, value, isHighlighted, isSpecial, label }: RegisterCardProps) {
  const [prevValue, setPrevValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value !== prevValue) {
      setIsAnimating(true);
      setPrevValue(value);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <motion.div
      initial={false}
      animate={{
        scale: isHighlighted ? 1.05 : 1,
        borderColor: isHighlighted
          ? isSpecial
            ? '#fbbf24'
            : '#10b981'
          : 'rgba(75, 85, 99, 0.5)',
        backgroundColor: isHighlighted
          ? isSpecial
            ? 'rgba(251, 191, 36, 0.2)'
            : 'rgba(16, 185, 129, 0.2)'
          : 'rgba(31, 41, 55, 0.8)',
      }}
      transition={{ duration: 0.2 }}
      className={`relative p-3 rounded-lg border ${
        isSpecial ? 'border-amber-500/50' : 'border-gray-700'
      } transition-shadow ${isHighlighted ? 'shadow-lg shadow-green-500/20' : ''}`}
    >
      {/* Register Name */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-mono font-semibold ${
          isSpecial ? 'text-amber-400' : 'text-cyan-400'
        }`}>
          {label || `R${index}`}
        </span>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-2 h-2 bg-green-400 rounded-full"
          />
        )}
      </div>

      {/* Register Value */}
      <div className="space-y-1">
        <motion.div
          key={value}
          initial={isAnimating ? { opacity: 0.5, y: -5 } : false}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-mono text-green-400"
        >
          0x{value.toString(16).padStart(8, '0').toUpperCase()}
        </motion.div>
        <div className="text-xs font-mono text-gray-500">
          {value}
        </div>
        <div className="text-xs font-mono text-gray-600">
          {value.toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1 ')}
        </div>
      </div>
    </motion.div>
  );
}

interface FlagBitProps {
  name: string;
  value: boolean;
  color: string;
}

function FlagBit({ name, value, color }: FlagBitProps) {
  return (
    <motion.div
      animate={{
        backgroundColor: value ? `${color}40` : 'rgba(31, 41, 55, 0.8)',
        borderColor: value ? color : 'rgba(75, 85, 99, 0.5)',
      }}
      className="flex flex-col items-center p-2 rounded border"
    >
      <span className={`text-xs font-bold ${value ? 'text-white' : 'text-gray-500'}`}>
        {name}
      </span>
      <span className={`text-xs font-mono ${value ? color.replace('bg-', 'text-') : 'text-gray-600'}`}>
        {value ? '1' : '0'}
      </span>
    </motion.div>
  );
}

export default function RegisterFile() {
  const { cpu, highlightedRegister, executionLog, setHighlightedRegister } = useCPUStore();
  const cpuState = cpu.getState();

  const flags = cpuState.flags;
  const flagBits = [
    { name: 'Z', value: !!(flags & FLAG_ZERO), color: '#10b981' },
    { name: 'N', value: !!(flags & FLAG_NEGATIVE), color: '#f59e0b' },
    { name: 'V', value: !!(flags & FLAG_OVERFLOW), color: '#ef4444' },
    { name: 'I', value: !!(flags & FLAG_INTERRUPT), color: '#8b5cf6' },
  ];

  const specialRegisters = [
    { name: 'PC', value: cpuState.pc, label: 'Program Counter' },
    { name: 'SP', value: cpuState.sp, label: 'Stack Pointer' },
    { name: 'CR3', value: cpuState.cr3, label: 'Page Dir Base' },
  ];

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-cyan-400">
          Register File
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          16 General Purpose Registers (32-bit)
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* Special Registers */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            Special Registers
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {specialRegisters.map((reg) => (
              <div key={reg.name} className="relative group">
                <RegisterCard
                  index={-1}
                  value={reg.value}
                  isHighlighted={false}
                  isSpecial={true}
                  label={reg.name}
                />
                <div className="absolute -bottom-6 left-0 w-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <div className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded border border-gray-600">
                    {reg.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* General Purpose Registers */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            General Purpose Registers
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 16 }, (_, i) => (
              <RegisterCard
                key={i}
                index={i}
                value={cpuState.registers[i]}
                isHighlighted={highlightedRegister === i}
              />
            ))}
          </div>
        </div>

        {/* Flags Register */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
            Flags Register (0x{flags.toString(16).padStart(2, '0').toUpperCase()})
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {flagBits.map((flag) => (
              <FlagBit
                key={flag.name}
                name={flag.name}
                value={flag.value}
                color={flag.color}
              />
            ))}
          </div>
          <div className="text-xs font-mono text-gray-500 text-center mt-2">
            {formatCPUFlags(flags)}
          </div>
        </div>

        {/* CPU State */}
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Status:</span>
            <span className={`font-mono ${
              cpuState.halted ? 'text-red-400' : 'text-green-400'
            }`}>
              {cpuState.halted ? 'HALTED' : 'RUNNING'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-gray-500">Cycles:</span>
            <span className="font-mono text-cyan-400">
              {cpuState.cycles.toString()}
            </span>
          </div>
          {cpuState.interruptPending && (
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-gray-500">Interrupt:</span>
              <span className="font-mono text-red-400">
                #{cpuState.interruptNumber} Pending
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
