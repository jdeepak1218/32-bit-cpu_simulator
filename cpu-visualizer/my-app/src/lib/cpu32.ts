/**
 * 32-bit CPU Emulator Core
 * Exact TypeScript translation of the C implementation
 */

import {
  NUM_REGISTERS,
  PAGE_SIZE,
  PAGE_MASK,
  FRAME_COUNT,
  PHYS_MEM_SIZE,
  TLB_ENTRIES,
  PTE_PRESENT,
  PTE_WRITABLE,
  PTE_USER,
  PTE_ACCESSED,
  PTE_DIRTY,
  FLAG_ZERO,
  FLAG_NEGATIVE,
  FLAG_OVERFLOW,
  FLAG_INTERRUPT,
  STACK_TOP,
  Opcode,
  decodeInstruction,
  extractVPN,
  extractOffset,
  extractPDIndex,
  extractPTIndex,
  pteFrame,
  pteFlags,
  hasFlag,
  type TLBEntry,
  type MMUState,
  type CPUState,
  type TranslationResult,
  type PageWalkStep,
  type ExecutionEvent,
  type Instruction,
} from '@/types/cpu';

// ============================================================================
// MMU CLASS
// ============================================================================

export class MMU {
  private state: MMUState;
  private onEvent?: (event: ExecutionEvent) => void;

  constructor(onEvent?: (event: ExecutionEvent) => void) {
    this.state = {
      physMem: new Uint8Array(PHYS_MEM_SIZE),
      frameBitmap: new Uint8Array(Math.ceil(FRAME_COUNT / 8)),
      cr3: 0,
      pagingEnabled: false,
      tlb: Array(TLB_ENTRIES).fill(null).map(() => ({
        vpn: 0,
        paddr: 0,
        flags: 0,
        valid: false,
      })),
      tlbNext: 0,
      tlbHits: 0,
      tlbMisses: 0,
      pageFaults: 0,
      reads: 0,
      writes: 0,
      faultAddr: 0,
      faultFlags: 0,
    };
    // Mark frame 0 as reserved
    this.state.frameBitmap[0] |= 1;
    this.onEvent = onEvent;
  }

  getState(): MMUState {
    return this.state;
  }

  reset(): void {
    this.state.physMem.fill(0);
    this.state.frameBitmap.fill(0);
    this.state.frameBitmap[0] |= 1;
    this.state.cr3 = 0;
    this.state.pagingEnabled = false;
    this.state.tlbNext = 0;
    this.state.tlbHits = 0;
    this.state.tlbMisses = 0;
    this.state.pageFaults = 0;
    this.state.reads = 0;
    this.state.writes = 0;
    this.state.faultAddr = 0;
    this.state.faultFlags = 0;
    this.tlbFlush();
  }

  setCR3(pdPaddr: number): void {
    this.state.cr3 = pdPaddr;
    this.tlbFlush();
  }

  enablePaging(enable: boolean): void {
    this.state.pagingEnabled = enable;
    if (!enable) {
      this.tlbFlush();
    }
  }

  isPagingEnabled(): boolean {
    return this.state.pagingEnabled;
  }

  // Frame allocation (returns physical address of frame)
  allocFrame(): number {
    for (let i = 1; i < FRAME_COUNT; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      if (!(this.state.frameBitmap[byteIdx] & (1 << bitIdx))) {
        this.state.frameBitmap[byteIdx] |= (1 << bitIdx);
        const paddr = i * PAGE_SIZE;
        // Clear the frame
        this.state.physMem.fill(0, paddr, paddr + PAGE_SIZE);
        return paddr;
      }
    }
    return 0; // Out of memory
  }

  freeFrame(paddr: number): void {
    const frame = Math.floor(paddr / PAGE_SIZE);
    if (frame === 0 || frame >= FRAME_COUNT) return;
    const byteIdx = Math.floor(frame / 8);
    const bitIdx = frame % 8;
    this.state.frameBitmap[byteIdx] &= ~(1 << bitIdx);
  }

  // TLB Operations
  tlbLookup(vpn: number): TLBEntry | null {
    for (let i = 0; i < TLB_ENTRIES; i++) {
      if (this.state.tlb[i].valid && this.state.tlb[i].vpn === vpn) {
        this.state.tlbHits++;
        if (this.onEvent) {
          this.onEvent({
            type: 'tlbHit',
            cycle: BigInt(0),
            pc: 0,
            details: { vpn, entry: this.state.tlb[i], index: i },
          });
        }
        return this.state.tlb[i];
      }
    }
    this.state.tlbMisses++;
    if (this.onEvent) {
      this.onEvent({
        type: 'tlbMiss',
        cycle: BigInt(0),
        pc: 0,
        details: { vpn },
      });
    }
    return null;
  }

  tlbInsert(vpn: number, paddr: number, flags: number): void {
    const i = this.state.tlbNext;
    this.state.tlb[i] = {
      vpn,
      paddr,
      flags,
      valid: true,
    };
    if (this.onEvent) {
      this.onEvent({
        type: 'tlbInsert',
        cycle: BigInt(0),
        pc: 0,
        details: { vpn, paddr, index: i },
      });
    }
    this.state.tlbNext = (this.state.tlbNext + 1) % TLB_ENTRIES;
  }

  tlbFlush(): void {
    for (let i = 0; i < TLB_ENTRIES; i++) {
      this.state.tlb[i].valid = false;
    }
    this.state.tlbNext = 0;
  }

  tlbInvalidate(vpn: number): void {
    for (let i = 0; i < TLB_ENTRIES; i++) {
      if (this.state.tlb[i].valid && this.state.tlb[i].vpn === vpn) {
        this.state.tlb[i].valid = false;
        return;
      }
    }
  }

  // Physical Memory Access
  physRead32(paddr: number): number {
    if (paddr + 4 > PHYS_MEM_SIZE) return 0;
    return (
      (this.state.physMem[paddr]) |
      (this.state.physMem[paddr + 1] << 8) |
      (this.state.physMem[paddr + 2] << 16) |
      (this.state.physMem[paddr + 3] << 24)
    );
  }

  physWrite32(paddr: number, val: number): void {
    if (paddr + 4 > PHYS_MEM_SIZE) return;
    this.state.physMem[paddr] = val & 0xFF;
    this.state.physMem[paddr + 1] = (val >>> 8) & 0xFF;
    this.state.physMem[paddr + 2] = (val >>> 16) & 0xFF;
    this.state.physMem[paddr + 3] = (val >>> 24) & 0xFF;
  }

  physRead8(paddr: number): number {
    if (paddr >= PHYS_MEM_SIZE) return 0;
    return this.state.physMem[paddr];
  }

  physWrite8(paddr: number, val: number): void {
    if (paddr >= PHYS_MEM_SIZE) return;
    this.state.physMem[paddr] = val & 0xFF;
  }

  // Page Table Walk with detailed steps
  pageTableWalk(vaddr: number, write: boolean, user: boolean): {
    result: TranslationResult;
    steps: PageWalkStep[];
  } {
    const steps: PageWalkStep[] = [];
    const vpn = extractVPN(vaddr);
    const offset = extractOffset(vaddr);
    const pdIdx = extractPDIndex(vaddr);
    const ptIdx = extractPTIndex(vaddr);

    // Step 1: Check TLB
    const tlbEntry = this.tlbLookup(vpn);
    if (tlbEntry) {
      // Check protection bits
      if (write && !hasFlag(tlbEntry.flags, PTE_WRITABLE)) {
        steps.push({
          description: 'TLB Hit but write protection fault',
          address: vaddr,
          valid: false,
        });
        this.state.faultAddr = vaddr;
        this.state.faultFlags = PTE_WRITABLE;
        this.state.pageFaults++;
        return {
          result: { paddr: 0, tlbHit: true, pageFault: true },
          steps,
        };
      }
      if (user && !hasFlag(tlbEntry.flags, PTE_USER)) {
        steps.push({
          description: 'TLB Hit but user protection fault',
          address: vaddr,
          valid: false,
        });
        this.state.faultAddr = vaddr;
        this.state.faultFlags = PTE_USER;
        this.state.pageFaults++;
        return {
          result: { paddr: 0, tlbHit: true, pageFault: true },
          steps,
        };
      }

      steps.push({
        description: 'TLB Hit',
        address: vaddr,
        value: tlbEntry.paddr,
        valid: true,
      });
      return {
        result: {
          paddr: tlbEntry.paddr | offset,
          tlbHit: true,
          pageFault: false,
        },
        steps,
      };
    }

    // Step 2: TLB Miss - Start Page Table Walk
    steps.push({
      description: `TLB Miss - Starting Page Table Walk for VPN 0x${vpn.toString(16).toUpperCase()}`,
      address: vaddr,
      valid: true,
    });

    // Step 3: Read Page Directory Entry
    const pdeAddr = this.state.cr3 + pdIdx * 4;
    if (pdeAddr + 4 > PHYS_MEM_SIZE) {
      steps.push({
        description: `PDE Address 0x${pdeAddr.toString(16).toUpperCase()} out of bounds`,
        address: pdeAddr,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = 0;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    const pde = this.physRead32(pdeAddr);
    steps.push({
      description: `Read PDE[${pdIdx}] at 0x${pdeAddr.toString(16).toUpperCase()}`,
      address: pdeAddr,
      value: pde,
      valid: true,
    });

    if (!hasFlag(pde, PTE_PRESENT)) {
      steps.push({
        description: `PDE not present (flags: 0x${pteFlags(pde).toString(16)})`,
        address: pdeAddr,
        value: pde,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = 0;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    // Step 4: Read Page Table Entry
    const ptBase = pteFrame(pde);
    const pteAddr = ptBase + ptIdx * 4;

    if (pteAddr + 4 > PHYS_MEM_SIZE) {
      steps.push({
        description: `PTE Address 0x${pteAddr.toString(16).toUpperCase()} out of bounds`,
        address: pteAddr,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = 0;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    const pte = this.physRead32(pteAddr);
    steps.push({
      description: `Read PTE[${ptIdx}] at 0x${pteAddr.toString(16).toUpperCase()}`,
      address: pteAddr,
      value: pte,
      valid: true,
    });

    if (!hasFlag(pte, PTE_PRESENT)) {
      steps.push({
        description: `PTE not present (flags: 0x${pteFlags(pte).toString(16)})`,
        address: pteAddr,
        value: pte,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = 0;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    // Check protection bits
    if (write && !hasFlag(pte, PTE_WRITABLE)) {
      steps.push({
        description: 'PTE write protection fault',
        address: pteAddr,
        value: pte,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = PTE_WRITABLE;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    if (user && !hasFlag(pte, PTE_USER)) {
      steps.push({
        description: 'PTE user protection fault',
        address: pteAddr,
        value: pte,
        valid: false,
      });
      this.state.faultAddr = vaddr;
      this.state.faultFlags = PTE_USER;
      this.state.pageFaults++;
      return {
        result: { paddr: 0, tlbHit: false, pageFault: true },
        steps,
      };
    }

    // Step 5: Update Accessed/Dirty bits
    let newPte = pte | PTE_ACCESSED;
    if (write) {
      newPte |= PTE_DIRTY;
    }
    if (newPte !== pte) {
      this.physWrite32(pteAddr, newPte);
    }

    // Step 6: Insert into TLB
    const frame = pteFrame(pte);
    this.tlbInsert(vpn, frame, pteFlags(pte));
    steps.push({
      description: `TLB Insert - VPN 0x${vpn.toString(16).toUpperCase()} → Frame 0x${(frame >>> 12).toString(16).toUpperCase()}`,
      address: frame,
      valid: true,
    });

    const paddr = frame | offset;
    steps.push({
      description: `Translation Complete: VA 0x${vaddr.toString(16).toUpperCase()} → PA 0x${paddr.toString(16).toUpperCase()}`,
      address: paddr,
      valid: true,
    });

    return {
      result: {
        paddr,
        tlbHit: false,
        pageFault: false,
        pageWalkSteps: steps,
      },
      steps,
    };
  }

  // Address Translation (main entry point)
  translate(vaddr: number, write: boolean, user: boolean): TranslationResult {
    if (!this.state.pagingEnabled) {
      return { paddr: vaddr, tlbHit: false, pageFault: false };
    }

    const { result, steps } = this.pageTableWalk(vaddr, write, user);
    if (this.onEvent && steps && steps.length > 0) {
      this.onEvent({ type: 'pageWalk', cycle: BigInt(0), pc: 0, details: { steps } });
    }
    return result;
  }

  // Map a page
  mapPage(vaddr: number, paddr: number, flags: number): boolean {
    const pdIdx = extractPDIndex(vaddr);
    const ptIdx = extractPTIndex(vaddr);
    const pdeAddr = this.state.cr3 + pdIdx * 4;

    // Get or create page table
    let pde = this.physRead32(pdeAddr);
    if (!hasFlag(pde, PTE_PRESENT)) {
      const ptFrame = this.allocFrame();
      if (!ptFrame) return false;
      pde = ptFrame | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
      this.physWrite32(pdeAddr, pde);
    }

    // Write PTE
    const ptBase = pteFrame(pde);
    const pteAddr = ptBase + ptIdx * 4;
    const pte = (paddr & PAGE_MASK) | (flags | PTE_PRESENT);
    this.physWrite32(pteAddr, pte);

    // Invalidate TLB entry for this VPN
    this.tlbInvalidate(extractVPN(vaddr));
    return true;
  }

  // Unmap a page
  unmapPage(vaddr: number): boolean {
    const pdIdx = extractPDIndex(vaddr);
    const ptIdx = extractPTIndex(vaddr);
    const pdeAddr = this.state.cr3 + pdIdx * 4;

    const pde = this.physRead32(pdeAddr);
    if (!hasFlag(pde, PTE_PRESENT)) return false;

    const ptBase = pteFrame(pde);
    const pteAddr = ptBase + ptIdx * 4;
    const pte = this.physRead32(pteAddr);
    if (!hasFlag(pte, PTE_PRESENT)) return false;

    // Free the frame
    this.freeFrame(pteFrame(pte));

    // Clear PTE
    this.physWrite32(pteAddr, 0);

    // Invalidate TLB
    this.tlbInvalidate(extractVPN(vaddr));
    return true;
  }

  // Virtual Memory Access
  read32(vaddr: number): number {
    this.state.reads++;
    const { paddr, pageFault } = this.translate(vaddr, false, false);
    if (pageFault) return 0;
    return this.physRead32(paddr);
  }

  write32(vaddr: number, val: number): void {
    this.state.writes++;
    const { paddr, pageFault } = this.translate(vaddr, true, false);
    if (pageFault) return;
    this.physWrite32(paddr, val);
  }

  read8(vaddr: number): number {
    this.state.reads++;
    const { paddr, pageFault } = this.translate(vaddr, false, false);
    if (pageFault) return 0;
    return this.physRead8(paddr);
  }

  write8(vaddr: number, val: number): void {
    this.state.writes++;
    const { paddr, pageFault } = this.translate(vaddr, true, false);
    if (pageFault) return;
    this.physWrite8(paddr, val);
  }
}

// ============================================================================
// CPU32 CLASS
// ============================================================================

export class CPU32 {
  private state: CPUState;
  private mmu: MMU;
  private onEvent?: (event: ExecutionEvent) => void;

  constructor(mmu: MMU, onEvent?: (event: ExecutionEvent) => void) {
    this.mmu = mmu;
    this.onEvent = onEvent;
    this.state = {
      registers: new Uint32Array(NUM_REGISTERS),
      pc: 0,
      sp: STACK_TOP,
      flags: 0,
      halted: false,
      cycles: BigInt(0),
      cr3: 0,
      interruptPending: false,
      interruptNumber: 0,
      interruptVector: new Uint32Array(256),
    };
  }

  getState(): CPUState {
    return this.state;
  }

  getMMU(): MMU {
    return this.mmu;
  }

  reset(): void {
    this.state.registers.fill(0);
    this.state.pc = 0;
    this.state.sp = STACK_TOP;
    this.state.flags = 0;
    this.state.halted = false;
    this.state.cycles = BigInt(0);
    this.state.cr3 = 0;
    this.state.interruptPending = false;
    this.state.interruptNumber = 0;
    this.state.interruptVector.fill(0);
  }

  setPC(pc: number): void {
    this.state.pc = pc;
  }

  setSP(sp: number): void {
    this.state.sp = sp;
  }

  setCR3(cr3: number): void {
    this.state.cr3 = cr3;
    this.mmu.setCR3(cr3);
  }

  // ALU Operations
  private updateFlags(result: number, a: number, b: number, op: Opcode): void {
    // Clear all flags except INTERRUPT
    this.state.flags &= FLAG_INTERRUPT;

    if (result === 0) {
      this.state.flags |= FLAG_ZERO;
    }
    if (result & 0x80000000) {
      this.state.flags |= FLAG_NEGATIVE;
    }

    const aNeg = (a & 0x80000000) !== 0;
    const bNeg = (b & 0x80000000) !== 0;
    const resNeg = (result & 0x80000000) !== 0;

    if (op === Opcode.ADD) {
      if (!aNeg && !bNeg && resNeg) {
        this.state.flags |= FLAG_OVERFLOW;
      } else if (aNeg && bNeg && !resNeg) {
        this.state.flags |= FLAG_OVERFLOW;
      }
    } else if (op === Opcode.CMP || op === Opcode.SUB) {
      if (!aNeg && bNeg && resNeg) {
        this.state.flags |= FLAG_OVERFLOW;
      } else if (aNeg && !bNeg && !resNeg) {
        this.state.flags |= FLAG_OVERFLOW;
      }
    }
  }

  private aluExecute(op: Opcode, a: number, b: number): number {
    let result = 0;

    switch (op) {
      case Opcode.ADD:
        result = (a + b) >>> 0;
        break;
      case Opcode.AND:
        result = a & b;
        break;
      case Opcode.OR:
        result = a | b;
        break;
      case Opcode.XOR:
        result = a ^ b;
        break;
      case Opcode.SHR:
        result = a >>> (b & 0x1F);
        break;
      case Opcode.SHL:
        result = (a << (b & 0x1F)) >>> 0;
        break;
      case Opcode.NOT:
        result = ~a;
        break;
      case Opcode.SUB:
      case Opcode.CMP:
        result = (a - b) >>> 0;
        break;
      case Opcode.MUL:
        result = (a * b) >>> 0;
        break;
      case Opcode.ROL:
        result = ((a << (b & 0x1F)) | (a >>> (32 - (b & 0x1F)))) >>> 0;
        break;
      case Opcode.ROR:
        result = ((a >>> (b & 0x1F)) | (a << (32 - (b & 0x1F)))) >>> 0;
        break;
      case Opcode.DIV:
        if (b === 0) {
          this.raiseInterrupt(1); // Divide by zero
          return 0;
        }
        result = Math.floor(a / b);
        break;
      case Opcode.MOD:
        if (b === 0) {
          this.raiseInterrupt(1); // Divide by zero
          return 0;
        }
        result = a % b;
        break;
      default:
        console.error(`ALU Error: unknown operation 0x${op.toString(16)}`);
        return 0;
    }

    this.updateFlags(result, a, b, op);
    return result;
  }

  // Memory Access
  private memRead32(address: number): number {
    const value = this.mmu.read32(address);
    if (this.onEvent) {
      const { paddr, tlbHit } = this.mmu['translate'](address, false, false);
      this.onEvent({
        type: 'memoryRead',
        cycle: this.state.cycles,
        pc: this.state.pc,
        details: { vaddr: address, paddr, value, tlbHit, size: 4 },
      });
    }
    return value;
  }

  private memWrite32(address: number, value: number): void {
    this.mmu.write32(address, value);
    if (this.onEvent) {
      const { paddr, tlbHit } = this.mmu['translate'](address, true, false);
      this.onEvent({
        type: 'memoryWrite',
        cycle: this.state.cycles,
        pc: this.state.pc,
        details: { vaddr: address, paddr, value, tlbHit, size: 4 },
      });
    }
  }

  // Interrupt Handling
  raiseInterrupt(num: number): void {
    if (this.state.flags & FLAG_INTERRUPT) {
      this.state.interruptPending = true;
      this.state.interruptNumber = num;
    }
  }

  pageFault(vaddr: number): void {
    console.log(`PAGE FAULT at virtual address: 0x${vaddr.toString(16).toUpperCase()}`);
    this.raiseInterrupt(14);
  }

  // Single Step Execution
  step(): { instruction: Instruction | null; completed: boolean; pageFault?: boolean } {
    if (this.state.halted) {
      return { instruction: null, completed: false };
    }

    // Handle pending interrupts
    if (this.state.interruptPending && !this.state.halted) {
      this.state.sp -= 4;
      this.memWrite32(this.state.sp, (this.state.pc + 4) >>> 0);
      this.state.sp -= 4;
      this.memWrite32(this.state.sp, (this.state.flags & ~FLAG_INTERRUPT) >>> 0);
      this.state.flags &= ~FLAG_INTERRUPT;
      this.state.pc = this.state.interruptVector[this.state.interruptNumber];
      this.state.interruptPending = false;
      this.state.cycles++;
      return { instruction: null, completed: true };
    }

    // Fetch instruction
    const instrRaw = this.memRead32(this.state.pc);
    const instruction = decodeInstruction(instrRaw, this.state.pc);

    if (this.onEvent) {
      this.onEvent({
        type: 'instructionFetch',
        cycle: this.state.cycles,
        pc: this.state.pc,
        details: { instruction },
      });
    }

    const dst = instruction.dst;
    const src = instruction.src;
    const imm = instruction.imm;
    const addr = instruction.address;

    let pcIncrement = true;

    switch (instruction.opcode) {
      case Opcode.NOP:
        break;

      case Opcode.HALT:
        this.state.halted = true;
        break;

      case Opcode.MOV:
        this.state.registers[dst] = this.state.registers[src];
        break;

      case Opcode.ADD:
      case Opcode.SUB:
      case Opcode.AND:
      case Opcode.DIV:
      case Opcode.MOD:
      case Opcode.OR:
      case Opcode.XOR:
      case Opcode.MUL:
      case Opcode.SHL:
      case Opcode.SHR:
      case Opcode.ROL:
      case Opcode.ROR:
        this.state.registers[dst] = this.aluExecute(
          instruction.opcode,
          this.state.registers[dst],
          this.state.registers[src]
        );
        break;

      case Opcode.NOT:
        this.state.registers[dst] = this.aluExecute(Opcode.NOT, this.state.registers[dst], 0);
        break;

      case Opcode.CMP:
        this.aluExecute(Opcode.CMP, this.state.registers[dst], this.state.registers[src]);
        break;

      case Opcode.JMP:
        this.state.pc = addr;
        this.state.cycles++;
        return { instruction, completed: true };

      case Opcode.JZ:
        if (this.state.flags & FLAG_ZERO) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JNZ:
        if (!(this.state.flags & FLAG_ZERO)) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JN:
        if (this.state.flags & FLAG_NEGATIVE) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JGT:
        if (!(this.state.flags & FLAG_ZERO) && !(this.state.flags & FLAG_NEGATIVE)) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JLT:
        if (this.state.flags & FLAG_NEGATIVE) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JGE:
        if (!(this.state.flags & FLAG_NEGATIVE)) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.JLE:
        if ((this.state.flags & FLAG_ZERO) || (this.state.flags & FLAG_NEGATIVE)) {
          this.state.pc = addr;
          this.state.cycles++;
          return { instruction, completed: true };
        }
        break;

      case Opcode.LOAD:
        this.state.registers[dst] = imm >>> 0;
        break;

      case Opcode.LDR:
        this.state.registers[dst] = this.memRead32(this.state.registers[src]);
        break;

      case Opcode.STR:
        this.memWrite32(this.state.registers[dst], this.state.registers[src]);
        break;

      case Opcode.PUSH:
        this.state.sp -= 4;
        this.memWrite32(this.state.sp, this.state.registers[src]);
        break;

      case Opcode.POP:
        this.state.registers[dst] = this.memRead32(this.state.sp);
        this.state.sp += 4;
        break;

      case Opcode.RET:
        this.state.pc = this.memRead32(this.state.sp);
        this.state.sp += 4;
        this.state.cycles++;
        return { instruction, completed: true };

      case Opcode.CALL:
        this.state.sp -= 4;
        this.memWrite32(this.state.sp, (this.state.pc + 4) >>> 0);
        this.state.pc = addr;
        this.state.cycles++;
        return { instruction, completed: true };

      case Opcode.STI:
        this.state.flags |= FLAG_INTERRUPT;
        break;

      case Opcode.CLI:
        this.state.flags &= ~FLAG_INTERRUPT;
        break;

      case Opcode.IRET:
        this.state.flags = this.memRead32(this.state.sp);
        this.state.sp += 4;
        this.state.pc = this.memRead32(this.state.sp);
        this.state.sp += 4;
        this.state.cycles++;
        return { instruction, completed: true };

      case Opcode.SWAP: {
        const temp = this.state.registers[dst];
        this.state.registers[dst] = this.state.registers[src];
        this.state.registers[src] = temp;
        break;
      }

      default:
        console.error(`Unknown opcode: 0x${(instruction.opcode as number).toString(16)} at PC: 0x${this.state.pc.toString(16)}`);
        this.state.halted = true;
        break;
    }

    if (pcIncrement) {
      this.state.pc += 4;
    }
    this.state.cycles++;

    return { instruction, completed: true };
  }

  // Run until halt
  run(): void {
    while (!this.state.halted) {
      this.step();
    }
  }

  // Load program into memory
  loadProgram(program: number[], startAddress: number = 0): void {
    for (let i = 0; i < program.length; i++) {
      this.mmu.write32(startAddress + i * 4, program[i]);
    }
  }

  // Set interrupt vector
  setInterruptVector(num: number, handler: number): void {
    this.state.interruptVector[num] = handler;
  }
}

export { CPUState, MMUState, TLBEntry, TranslationResult, PageWalkStep, ExecutionEvent };
