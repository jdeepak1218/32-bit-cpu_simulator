/**
 * CPU Visualizer State Store
 * Optimized Zustand store without immer for performance
 */

import { create } from 'zustand';
import { CPU32, MMU } from '@/lib/cpu32';
import {
  assemble,
  EXAMPLE_PROGRAMS,
  disassemble,
} from '@/lib/assembler';
import {
  type AssemblyLine,
  type ExecutionEvent,
  type PageWalkStep,
  STACK_TOP,
} from '@/types/cpu';

export interface ExecutionLogEntry {
  cycle: bigint;
  pc: number;
  instruction: string;
  machineCode: string;
  registersBefore: Uint32Array;
  registersAfter: Uint32Array;
  flagsBefore: number;
  flagsAfter: number;
  spBefore: number;
  spAfter: number;
  tlbHit?: boolean;
  pageWalkSteps?: PageWalkStep[];
  memoryAccess?: {
    type: 'read' | 'write';
    vaddr: number;
    paddr: number;
    value: number;
  };
}

interface CPUStore {
  // Core components (stable references - never replaced)
  cpu: CPU32;
  mmu: MMU;

  // Assembly state
  sourceCode: string;
  assemblyLines: AssemblyLine[];
  assemblyErrors: string[];
  machineCode: number[];

  // Execution state
  isRunning: boolean;
  isPaused: boolean;
  executionSpeed: number;
  currentLine: number;
  executionLog: ExecutionLogEntry[];
  maxLogEntries: number;

  // Breakpoints
  breakpoints: Set<number>;

  // Visualization state
  highlightedRegister: number | null;
  highlightedMemoryVAddr: number | null;
  highlightedMemoryPAddr: number | null;
  highlightedTLBEntry: number | null;
  showPageWalk: boolean;
  currentPageWalkSteps: PageWalkStep[] | null;
  showAddressTranslation: boolean;
  addressToTranslate: number;

  // Statistics
  startTime: number | null;
  instructionCount: number;

  // Page fault notification
  pageFaultNotification: { vaddr: number; cycle: bigint; description: string } | null;

  // Actions
  clearPageFaultNotification: () => void;
  setSourceCode: (code: string) => void;
  assembleCode: () => boolean;
  loadExample: (name: keyof typeof EXAMPLE_PROGRAMS) => void;

  // Execution control
  run: () => void;
  pause: () => void;
  step: () => { completed: boolean; pageFault?: boolean };
  reset: () => void;
  setExecutionSpeed: (speed: number) => void;
  toggleBreakpoint: (address: number) => void;
  clearExecutionLog: () => void;

  // Visualization
  setHighlightedRegister: (reg: number | null) => void;
  setHighlightedMemory: (vaddr: number | null, paddr?: number | null) => void;
  setHighlightedTLBEntry: (entry: number | null) => void;
  setShowPageWalk: (show: boolean) => void;
  setCurrentPageWalkSteps: (steps: PageWalkStep[] | null) => void;
  setShowAddressTranslation: (show: boolean) => void;
  setAddressToTranslate: (addr: number) => void;

  // Memory management
  mapPage: (vaddr: number, paddr: number, flags: number) => void;
  unmapPage: (vaddr: number) => void;
  enablePaging: (enable: boolean) => void;
  setupDefaultMapping: () => void;

  // Interrupt vector
  setInterruptVector: (num: number, handler: number) => void;

  // Event handling
  handleExecutionEvent: (event: ExecutionEvent) => void;
}

// Module-level run loop cancellation
let cancelRunLoop: (() => void) | null = null;

// Create stable CPU and MMU instances outside the store
const mmuInstance = new MMU(() => {});
const cpuInstance = new CPU32(mmuInstance, () => {});

// Setup default memory mapping
function setupDefaultMapping(mmu: MMU, cpu: CPU32): void {
  const pdFrame = mmu.allocFrame();
  cpu.setCR3(pdFrame);

  // Map code pages (identity mapping for simplicity)
  for (let addr = 0; addr < 0x3000; addr += 0x1000) {
    const frame = mmu.allocFrame();
    if (frame) {
      mmu.mapPage(addr, frame, 0x3);
    }
  }

  // Map stack page
  const stackFrame = mmu.allocFrame();
  if (stackFrame) {
    mmu.mapPage(STACK_TOP & ~0xFFF, stackFrame, 0x3);
  }

  // Setup interrupt handler vectors
  cpu.setInterruptVector(0, 0x5000);
  cpu.setInterruptVector(1, 0x5000);
  cpu.setInterruptVector(14, 0x5000);

  // Map handler pages
  const handlerFrame = mmu.allocFrame();
  if (handlerFrame) {
    mmu.mapPage(0x5000, handlerFrame, 0x3);
    mmu.write32(0x5000, 0x1C000000); // IRET
  }

  mmu.enablePaging(true);
}

export const useCPUStore = create<CPUStore>((set, get) => {
  // Wire up event callbacks after store is created
  const wireCallbacks = () => {
    mmuInstance['onEvent'] = (event) => get().handleExecutionEvent(event);
    cpuInstance['onEvent'] = (event) => get().handleExecutionEvent(event);
  };

  // Initial setup
  setupDefaultMapping(mmuInstance, cpuInstance);
  wireCallbacks();

  return {
    cpu: cpuInstance,
    mmu: mmuInstance,

    sourceCode: EXAMPLE_PROGRAMS.factorial,
    assemblyLines: [],
    assemblyErrors: [],
    machineCode: [],

    isRunning: false,
    isPaused: false,
    executionSpeed: 1,
    currentLine: -1,
    executionLog: [],
    maxLogEntries: 1000,

    breakpoints: new Set(),

    highlightedRegister: null,
    highlightedMemoryVAddr: null,
    highlightedMemoryPAddr: null,
    highlightedTLBEntry: null,
    showPageWalk: false,
    currentPageWalkSteps: null,
    showAddressTranslation: false,
    addressToTranslate: 0,

    startTime: null,
    instructionCount: 0,

    pageFaultNotification: null,

    setSourceCode: (code) => set({ sourceCode: code }),

    assembleCode: () => {
      const { sourceCode } = get();
      const { machineCode, assemblyLines, errors } = assemble(sourceCode);

      set({
        assemblyLines,
        assemblyErrors: errors,
        machineCode,
        currentLine: -1,
      });

      const { cpu } = get();
      cpu.loadProgram(machineCode, 0);

      return errors.length === 0;
    },

    loadExample: (name) => {
      const code = EXAMPLE_PROGRAMS[name];
      set({ sourceCode: code });
      get().assembleCode();
    },

    run: () => {
      let rafId: number | null = null;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      set({ isRunning: true, isPaused: false });

      const { cpu, breakpoints } = get();
      let isCancelled = false;

      cancelRunLoop = () => {
        isCancelled = true;
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (timerId !== null) { clearTimeout(timerId); timerId = null; }
        cancelRunLoop = null;
      };

      const runLoop = () => {
        const { isRunning, isPaused } = get();
        if (!isRunning || isPaused || isCancelled) return;

        const pc = cpu.getState().pc;
        if (breakpoints.has(pc)) {
          set({ isPaused: true });
          return;
        }

        const speed = get().executionSpeed;
        const batchSize = speed > 10000 ? 100 : speed > 1000 ? 50 : speed > 100 ? 20 : 1;

        for (let i = 0; i < batchSize; i++) {
          const result = get().step();
          if (!result.completed || result.pageFault) {
            set({ isRunning: false });
            return;
          }
          if (get().breakpoints.has(cpu.getState().pc)) {
            set({ isPaused: true });
            return;
          }
        }

        if (typeof requestAnimationFrame !== 'undefined' && speed > 1000) {
          rafId = requestAnimationFrame(runLoop);
        } else {
          const delay = Math.max(1, 1000 / speed);
          timerId = setTimeout(runLoop, delay);
        }
      };

      runLoop();
    },

    pause: () => {
      cancelRunLoop?.();
      set({ isPaused: true, isRunning: false });
    },

    step: () => {
      const { cpu } = get();
      const cpuState = cpu.getState();
      const pcBefore = cpuState.pc;
      const registersBefore = new Uint32Array(cpuState.registers);
      const flagsBefore = cpuState.flags;
      const spBefore = cpuState.sp;

      const { instruction, completed, pageFault } = cpu.step();

      const cpuStateAfter = cpu.getState();

      const { assemblyLines } = get();
      let currentLine = -1;
      for (let i = 0; i < assemblyLines.length; i++) {
        if (assemblyLines[i].address === pcBefore) {
          currentLine = i;
          break;
        }
      }

      if (instruction) {
        const disasm = disassemble(instruction.raw);
        const logEntry: ExecutionLogEntry = {
          cycle: cpuState.cycles,
          pc: pcBefore,
          instruction: disasm,
          machineCode: `0x${instruction.raw.toString(16).padStart(8, '0').toUpperCase()}`,
          registersBefore,
          registersAfter: new Uint32Array(cpuStateAfter.registers),
          flagsBefore,
          flagsAfter: cpuStateAfter.flags,
          spBefore,
          spAfter: cpuStateAfter.sp,
        };

        set((state) => {
          const newLog = [...state.executionLog, logEntry];
          if (newLog.length > state.maxLogEntries) {
            newLog.shift();
          }
          return {
            currentLine,
            instructionCount: state.instructionCount + 1,
            executionLog: newLog,
          };
        });
      } else {
        set({ currentLine, instructionCount: get().instructionCount + 1 });
      }

      return { completed, pageFault };
    },

    reset: () => {
      cancelRunLoop?.();

      const { cpu, mmu, machineCode } = get();

      cpu.reset();
      mmu.reset();

      cpu.loadProgram(machineCode, 0);
      setupDefaultMapping(mmu, cpu);

      set({
        isRunning: false,
        isPaused: false,
        currentLine: -1,
        executionLog: [],
        instructionCount: 0,
        startTime: null,
        highlightedRegister: null,
        highlightedMemoryVAddr: null,
        highlightedMemoryPAddr: null,
        highlightedTLBEntry: null,
        currentPageWalkSteps: null,
        pageFaultNotification: null,
        showPageWalk: false,
      });
    },

    setExecutionSpeed: (speed) => set({ executionSpeed: speed }),

    toggleBreakpoint: (address) => {
      set((state) => {
        const newBreakpoints = new Set(state.breakpoints);
        if (newBreakpoints.has(address)) {
          newBreakpoints.delete(address);
        } else {
          newBreakpoints.add(address);
        }
        return { breakpoints: newBreakpoints };
      });
    },

    clearExecutionLog: () => set({ executionLog: [] }),

    clearPageFaultNotification: () => set({ pageFaultNotification: null }),

    setHighlightedRegister: (reg) => set({ highlightedRegister: reg }),

    setHighlightedMemory: (vaddr, paddr) => {
      set({
        highlightedMemoryVAddr: vaddr,
        highlightedMemoryPAddr: paddr !== undefined ? paddr : null,
      });
    },

    setHighlightedTLBEntry: (entry) => set({ highlightedTLBEntry: entry }),

    setShowPageWalk: (show) => set({ showPageWalk: show }),

    setCurrentPageWalkSteps: (steps) => set({ currentPageWalkSteps: steps }),

    setShowAddressTranslation: (show) => set({ showAddressTranslation: show }),

    setAddressToTranslate: (addr) => set({ addressToTranslate: addr }),

    mapPage: (vaddr, paddr, flags) => {
      get().mmu.mapPage(vaddr, paddr, flags);
    },

    unmapPage: (vaddr) => {
      get().mmu.unmapPage(vaddr);
    },

    enablePaging: (enable) => {
      get().mmu.enablePaging(enable);
    },

    setupDefaultMapping: () => {
      setupDefaultMapping(get().mmu, get().cpu);
    },

    setInterruptVector: (num, handler) => {
      get().cpu.setInterruptVector(num, handler);
    },

    handleExecutionEvent: (event) => {
      switch (event.type) {
        case 'registerWrite': {
          const reg = event.details.register as number;
          set({ highlightedRegister: reg });
          setTimeout(() => {
            set({ highlightedRegister: null });
          }, 600);
          break;
        }
        case 'memoryRead':
        case 'memoryWrite': {
          set({
            highlightedMemoryVAddr: event.details.vaddr as number,
            highlightedMemoryPAddr: event.details.paddr as number,
          });
          const state = get();
          if (state.executionLog.length > 0) {
            const lastEntry = state.executionLog[state.executionLog.length - 1];
            if (lastEntry) {
              lastEntry.memoryAccess = {
                type: event.type === 'memoryRead' ? 'read' : 'write',
                vaddr: event.details.vaddr as number,
                paddr: event.details.paddr as number,
                value: event.details.value as number,
              };
              lastEntry.tlbHit = event.details.tlbHit as boolean;
            }
          }
          break;
        }
        case 'tlbHit': {
          const tlbEntry = event.details.entry as { vpn: number; valid: boolean };
          const mmuState = get().mmu.getState();
          for (let i = 0; i < 64; i++) {
            if (mmuState.tlb[i].vpn === tlbEntry.vpn && mmuState.tlb[i].valid) {
              set({ highlightedTLBEntry: i });
              break;
            }
          }
          break;
        }
        case 'tlbMiss':
          set({ showPageWalk: true });
          break;
        case 'pageWalk':
          set({ currentPageWalkSteps: event.details.steps as PageWalkStep[] || null });
          break;
        case 'pageFault': {
          const vaddr = event.details.vaddr as number;
          const cycle = event.cycle;
          set({
            showPageWalk: true,
            pageFaultNotification: {
              vaddr,
              cycle,
              description: (event.details.reason as string) || `Page fault at virtual address 0x${vaddr.toString(16).toUpperCase()}`,
            },
          });
          setTimeout(() => {
            const current = get().pageFaultNotification;
            if (current && current.cycle === cycle) {
              set({ pageFaultNotification: null });
            }
          }, 5000);
          break;
        }
      }
    },
  };
});
