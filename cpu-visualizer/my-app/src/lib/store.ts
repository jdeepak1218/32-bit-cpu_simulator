/**
 * CPU Visualizer State Store
 * Using Zustand for predictable state management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
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
  // Core components
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
  executionSpeed: number; // Hz
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

  // Actions
  setSourceCode: (code: string) => void;
  assembleCode: () => void;
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

export const useCPUStore = create<CPUStore>()(
  immer((set, get) => {
    // Create MMU and CPU
    const mmu = new MMU((event) => get().handleExecutionEvent(event));
    const cpu = new CPU32(mmu, (event) => get().handleExecutionEvent(event));

    // Setup default mapping
    const setupDefaultMapping = () => {
      // Allocate page directory
      const pdFrame = mmu.allocFrame();
      cpu.setCR3(pdFrame);

      // Map code pages (identity mapping for simplicity)
      // Map pages 0x0000 - 0x2000
      for (let addr = 0; addr < 0x3000; addr += 0x1000) {
        const frame = mmu.allocFrame();
        if (frame) {
          mmu.mapPage(addr, frame, 0x3); // Present + Writable
        }
      }

      // Map stack page
      const stackFrame = mmu.allocFrame();
      if (stackFrame) {
        mmu.mapPage(STACK_TOP & ~0xFFF, stackFrame, 0x3);
      }

      // Setup interrupt handler vectors
      cpu.setInterruptVector(0, 0x5000);  // Divide by zero
      cpu.setInterruptVector(1, 0x5000);  // Division error
      cpu.setInterruptVector(14, 0x5000); // Page fault

      // Map handler pages
      const handlerFrame = mmu.allocFrame();
      if (handlerFrame) {
        mmu.mapPage(0x5000, handlerFrame, 0x3);
        // Simple handler: IRET
        mmu.write32(0x5000, 0x1C000000); // IRET
      }

      // Enable paging
      mmu.enablePaging(true);
    };

    return {
      // Core components
      cpu,
      mmu,

      // Assembly state
      sourceCode: EXAMPLE_PROGRAMS.factorial,
      assemblyLines: [],
      assemblyErrors: [],
      machineCode: [],

      // Execution state
      isRunning: false,
      isPaused: false,
      executionSpeed: 1, // 1 Hz default
      currentLine: -1,
      executionLog: [],
      maxLogEntries: 1000,

      // Breakpoints
      breakpoints: new Set(),

      // Visualization state
      highlightedRegister: null,
      highlightedMemoryVAddr: null,
      highlightedMemoryPAddr: null,
      highlightedTLBEntry: null,
      showPageWalk: false,
      currentPageWalkSteps: null,
      showAddressTranslation: false,
      addressToTranslate: 0,

      // Statistics
      startTime: null,
      instructionCount: 0,

      // Actions
      setSourceCode: (code) => {
        set((state) => {
          state.sourceCode = code;
        });
      },

      assembleCode: () => {
        const { sourceCode } = get();
        const { machineCode, assemblyLines, errors } = assemble(sourceCode);

        set((state) => {
          state.assemblyLines = assemblyLines;
          state.assemblyErrors = errors;
          state.machineCode = machineCode;
          state.currentLine = -1;
        });

        // Load machine code into memory
        const { cpu } = get();
        cpu.loadProgram(machineCode, 0);

        return errors.length === 0;
      },

      loadExample: (name) => {
        const code = EXAMPLE_PROGRAMS[name];
        set((state) => {
          state.sourceCode = code;
        });
        get().assembleCode();
      },

      // Execution control
      run: () => {
        set((state) => {
          state.isRunning = true;
          state.isPaused = false;
          if (!state.startTime) {
            state.startTime = Date.now();
          }
        });

        const { executionSpeed, breakpoints } = get();
        const intervalMs = 1000 / executionSpeed;

        const runLoop = () => {
          const { isRunning, isPaused, cpu, currentLine } = get();

          if (!isRunning || isPaused) return;

          // Check for breakpoint
          const pc = cpu.getState().pc;
          if (breakpoints.has(pc)) {
            set((state) => {
              state.isPaused = true;
            });
            return;
          }

          // Execute step
          const result = get().step();

          if (!result.completed || result.pageFault) {
            set((state) => {
              state.isRunning = false;
            });
            return;
          }

          // Schedule next step
          setTimeout(runLoop, intervalMs);
        };

        runLoop();
      },

      pause: () => {
        set((state) => {
          state.isPaused = true;
          state.isRunning = false;
        });
      },

      step: () => {
        const { cpu } = get();
        const cpuState = cpu.getState();
        const mmuState = cpu.getMMU().getState();

        // Capture state before execution
        const registersBefore = new Uint32Array(cpuState.registers);
        const flagsBefore = cpuState.flags;
        const spBefore = cpuState.sp;
        const pcBefore = cpuState.pc;

        // Execute
        const { instruction, completed, pageFault } = cpu.step();

        // Capture state after execution
        const cpuStateAfter = cpu.getState();
        const registersAfter = new Uint32Array(cpuStateAfter.registers);
        const flagsAfter = cpuStateAfter.flags;
        const spAfter = cpuStateAfter.sp;

        // Update current line
        const { assemblyLines } = get();
        let currentLine = -1;
        for (let i = 0; i < assemblyLines.length; i++) {
          if (assemblyLines[i].address === pcBefore) {
            currentLine = i;
            break;
          }
        }

        set((state) => {
          state.currentLine = currentLine;
          state.instructionCount++;

          if (instruction) {
            const disasm = disassemble(instruction.raw);
            const logEntry: ExecutionLogEntry = {
              cycle: cpuState.cycles,
              pc: pcBefore,
              instruction: disasm,
              machineCode: `0x${instruction.raw.toString(16).padStart(8, '0').toUpperCase()}`,
              registersBefore,
              registersAfter,
              flagsBefore,
              flagsAfter,
              spBefore,
              spAfter,
            };

            state.executionLog.push(logEntry);

            // Trim log if too large
            if (state.executionLog.length > state.maxLogEntries) {
              state.executionLog.shift();
            }
          }
        });

        return { completed, pageFault };
      },

      reset: () => {
        const { cpu, mmu } = get();

        cpu.reset();
        mmu.reset();

        // Reload program
        const { machineCode } = get();
        cpu.loadProgram(machineCode, 0);

        // Setup default mapping
        setupDefaultMapping();

        set((state) => {
          state.isRunning = false;
          state.isPaused = false;
          state.currentLine = -1;
          state.executionLog = [];
          state.instructionCount = 0;
          state.startTime = null;
          state.highlightedRegister = null;
          state.highlightedMemoryVAddr = null;
          state.highlightedMemoryPAddr = null;
          state.highlightedTLBEntry = null;
          state.currentPageWalkSteps = null;
        });
      },

      setExecutionSpeed: (speed) => {
        set((state) => {
          state.executionSpeed = speed;
        });
      },

      toggleBreakpoint: (address) => {
        set((state) => {
          if (state.breakpoints.has(address)) {
            state.breakpoints.delete(address);
          } else {
            state.breakpoints.add(address);
          }
        });
      },

      clearExecutionLog: () => {
        set((state) => {
          state.executionLog = [];
        });
      },

      // Visualization
      setHighlightedRegister: (reg) => {
        set((state) => {
          state.highlightedRegister = reg;
        });
      },

      setHighlightedMemory: (vaddr, paddr) => {
        set((state) => {
          state.highlightedMemoryVAddr = vaddr;
          if (paddr !== undefined) {
            state.highlightedMemoryPAddr = paddr;
          }
        });
      },

      setHighlightedTLBEntry: (entry) => {
        set((state) => {
          state.highlightedTLBEntry = entry;
        });
      },

      setShowPageWalk: (show) => {
        set((state) => {
          state.showPageWalk = show;
        });
      },

      setCurrentPageWalkSteps: (steps) => {
        set((state) => {
          state.currentPageWalkSteps = steps;
        });
      },

      setShowAddressTranslation: (show) => {
        set((state) => {
          state.showAddressTranslation = show;
        });
      },

      setAddressToTranslate: (addr) => {
        set((state) => {
          state.addressToTranslate = addr;
        });
      },

      // Memory management
      mapPage: (vaddr, paddr, flags) => {
        const { mmu } = get();
        return mmu.mapPage(vaddr, paddr, flags);
      },

      unmapPage: (vaddr) => {
        const { mmu } = get();
        return mmu.unmapPage(vaddr);
      },

      enablePaging: (enable) => {
        const { mmu } = get();
        mmu.enablePaging(enable);
      },

      setupDefaultMapping,

      // Interrupt vector
      setInterruptVector: (num, handler) => {
        const { cpu } = get();
        cpu.setInterruptVector(num, handler);
      },

      // Event handling
      handleExecutionEvent: (event) => {
        set((state) => {
          switch (event.type) {
            case 'registerRead':
              state.highlightedRegister = event.details.register as number;
              break;
            case 'registerWrite':
                  state.highlightedRegister = event.details.register as number;
                  // Pulse highlight for 600ms
                  setTimeout(() => {
                    set((s) => { s.highlightedRegister = null; });
                  }, 600);
                  break;
            case 'memoryRead':
            case 'memoryWrite':
              state.highlightedMemoryVAddr = event.details.vaddr as number;
              state.highlightedMemoryPAddr = event.details.paddr as number;
              // Update last log entry
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
            case 'tlbHit':
              // Find the TLB entry index
              const tlbEntry = event.details.entry as { vpn: number; valid: boolean };
              for (let i = 0; i < 64; i++) {
                if (state.mmu.getState().tlb[i].vpn === tlbEntry.vpn &&
                    state.mmu.getState().tlb[i].valid) {
                  state.highlightedTLBEntry = i;
                  break;
                }
              }
              break;
            case 'tlbMiss':
              state.showPageWalk = true;
              break;
            case 'pageWalk':
              state.currentPageWalkSteps = event.details.steps as PageWalkStep[] || null;
              break;
            case 'instructionFetch':
              // Already handled in step()
              break;
          }
        });
      },
    };
  })
);
