/**
 * 32-bit CPU Architecture Types
 * Translated from C implementation
 */

// ============================================================================
// CONSTANTS (from C headers)
// ============================================================================

export const NUM_REGISTERS = 16;
export const PAGE_SIZE = 4096;
export const PAGE_SHIFT = 12;
export const PAGE_MASK = 0xFFFFF000;
export const PD_ENTRIES = 1024;
export const PT_ENTRIES = 1024;
export const PHYS_MEM_SIZE = 64 * 1024 * 1024; // 64MB
export const FRAME_COUNT = PHYS_MEM_SIZE / PAGE_SIZE; // 16384 frames
export const TLB_ENTRIES = 64;
export const STACK_TOP = 0x003FFFF0;

// Page Table Entry Flags
export const PTE_PRESENT = 1 << 0;
export const PTE_WRITABLE = 1 << 1;
export const PTE_USER = 1 << 2;
export const PTE_ACCESSED = 1 << 3;
export const PTE_DIRTY = 1 << 4;

// CPU Flags
export const FLAG_ZERO = 1 << 0;
export const FLAG_NEGATIVE = 1 << 1;
export const FLAG_OVERFLOW = 1 << 2;
export const FLAG_INTERRUPT = 1 << 3;

// Instruction encoding masks
export const OPCODE_MASK = 0x3F;      // 6 bits
export const DST_MASK = 0xF;          // 4 bits
export const SRC_MASK = 0xF;          // 4 bits
export const IMM18_MASK = 0x3FFFF;    // 18 bits
export const ADDR26_MASK = 0x3FFFFFF; // 26 bits

// Shift amounts for instruction encoding
export const OPCODE_SHIFT = 26;
export const DST_SHIFT = 22;
export const SRC_SHIFT = 18;

// ============================================================================
// ENUMS
// ============================================================================

export enum Opcode {
  NOP = 0x00,
  LOAD = 0x01,
  MOV = 0x02,
  ADD = 0x03,
  SUB = 0x04,
  AND = 0x05,
  OR = 0x06,
  XOR = 0x07,
  NOT = 0x08,
  SHL = 0x09,
  SHR = 0x0A,
  CMP = 0x0B,
  JMP = 0x0C,
  JZ = 0x0D,
  JNZ = 0x0E,
  JN = 0x0F,
  LDR = 0x10,
  STR = 0x11,
  PUSH = 0x12,
  POP = 0x13,
  CALL = 0x14,
  RET = 0x15,
  HALT = 0x16,
  MUL = 0x17,
  DIV = 0x18,
  MOD = 0x19,
  STI = 0x1A,
  CLI = 0x1B,
  IRET = 0x1C,
  JGT = 0x1D,
  JLT = 0x1E,
  JGE = 0x1F,
  JLE = 0x20,
  ROL = 0x21,
  ROR = 0x22,
  SWAP = 0x23,
}

export const OpcodeNames: Record<Opcode, string> = {
  [Opcode.NOP]: 'NOP',
  [Opcode.LOAD]: 'LOAD',
  [Opcode.MOV]: 'MOV',
  [Opcode.ADD]: 'ADD',
  [Opcode.SUB]: 'SUB',
  [Opcode.AND]: 'AND',
  [Opcode.OR]: 'OR',
  [Opcode.XOR]: 'XOR',
  [Opcode.NOT]: 'NOT',
  [Opcode.SHL]: 'SHL',
  [Opcode.SHR]: 'SHR',
  [Opcode.CMP]: 'CMP',
  [Opcode.JMP]: 'JMP',
  [Opcode.JZ]: 'JZ',
  [Opcode.JNZ]: 'JNZ',
  [Opcode.JN]: 'JN',
  [Opcode.LDR]: 'LDR',
  [Opcode.STR]: 'STR',
  [Opcode.PUSH]: 'PUSH',
  [Opcode.POP]: 'POP',
  [Opcode.CALL]: 'CALL',
  [Opcode.RET]: 'RET',
  [Opcode.HALT]: 'HALT',
  [Opcode.MUL]: 'MUL',
  [Opcode.DIV]: 'DIV',
  [Opcode.MOD]: 'MOD',
  [Opcode.STI]: 'STI',
  [Opcode.CLI]: 'CLI',
  [Opcode.IRET]: 'IRET',
  [Opcode.JGT]: 'JGT',
  [Opcode.JLT]: 'JLT',
  [Opcode.JGE]: 'JGE',
  [Opcode.JLE]: 'JLE',
  [Opcode.ROL]: 'ROL',
  [Opcode.ROR]: 'ROR',
  [Opcode.SWAP]: 'SWAP',
};

// ============================================================================
// INTERFACES
// ============================================================================

export interface TLBEntry {
  vpn: number;      // Virtual Page Number
  paddr: number;    // Physical Address (frame base)
  flags: number;    // PTE flags
  valid: boolean;
}

export interface MMUState {
  physMem: Uint8Array;           // Physical memory (64MB)
  frameBitmap: Uint8Array;       // Frame allocation bitmap
  cr3: number;                     // Page Directory Base Register
  pagingEnabled: boolean;
  tlb: TLBEntry[];                // TLB array (64 entries)
  tlbNext: number;                 // Next TLB entry to replace (FIFO)
  tlbHits: number;
  tlbMisses: number;
  pageFaults: number;
  reads: number;
  writes: number;
  faultAddr: number;
  faultFlags: number;
}

export interface CPUState {
  registers: Uint32Array;         // 16 registers (R0-R15)
  pc: number;                     // Program Counter
  sp: number;                     // Stack Pointer
  flags: number;                  // Flags register
  halted: boolean;
  cycles: bigint;                 // 64-bit cycle counter
  cr3: number;                    // Page directory base (also in MMU)
  interruptPending: boolean;
  interruptNumber: number;
  interruptVector: Uint32Array; // 256 interrupt vectors
}

export interface TranslationResult {
  paddr: number;
  tlbHit: boolean;
  pageFault: boolean;
  pageWalkSteps?: PageWalkStep[];
}

export interface PageWalkStep {
  description: string;
  address: number;
  value?: number;
  valid: boolean;
}

export interface ExecutionEvent {
  type: 'registerRead' | 'registerWrite' | 'memoryRead' | 'memoryWrite' | 'tlbHit' | 'tlbMiss' | 'tlbInsert' | 'pageWalk' | 'pageFault' | 'instructionFetch' | 'interrupt';
  cycle: bigint;
  pc: number;
  details: Record<string, unknown>;
}

export interface Instruction {
  opcode: Opcode;
  mnemonic: string;
  dst: number;
  src: number;
  imm: number;
  address: number; // 26-bit jump address
  raw: number;
  size: number; // Always 4 bytes
}

export interface AssemblyLine {
  address: number;
  machineCode: number;
  source: string;
  label?: string;
  instruction?: Instruction;
  breakpoint?: boolean;
}

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
  memoryAccess?: {
    type: 'read' | 'write';
    vaddr: number;
    paddr: number;
    value: number;
    tlbHit: boolean;
  };
}

// ============================================================================
// INSTRUCTION DECODING HELPERS
// ============================================================================

export function decodeOpcode(instr: number): Opcode {
  return ((instr >>> OPCODE_SHIFT) & OPCODE_MASK) as Opcode;
}

export function decodeDst(instr: number): number {
  return (instr >>> DST_SHIFT) & DST_MASK;
}

export function decodeSrc(instr: number): number {
  return (instr >>> SRC_SHIFT) & SRC_MASK;
}

export function decodeImm18(instr: number): number {
  // Sign extend 18-bit immediate
  const imm = instr & IMM18_MASK;
  return (imm & 0x20000) ? (imm | 0xFFFC0000) : imm;
}

export function decodeAddr26(instr: number): number {
  return instr & ADDR26_MASK;
}

export function encodeInstruction(op: Opcode, dst: number, src: number, imm: number): number {
  return ((op & OPCODE_MASK) << OPCODE_SHIFT) |
         ((dst & DST_MASK) << DST_SHIFT) |
         ((src & SRC_MASK) << SRC_SHIFT) |
         (imm & IMM18_MASK);
}

export function encodeJump(op: Opcode, address: number): number {
  return ((op & OPCODE_MASK) << OPCODE_SHIFT) | (address & ADDR26_MASK);
}

export function decodeInstruction(instr: number, pc: number): Instruction {
  const opcode = decodeOpcode(instr);
  return {
    opcode,
    mnemonic: OpcodeNames[opcode] || 'UNKNOWN',
    dst: decodeDst(instr),
    src: decodeSrc(instr),
    imm: decodeImm18(instr),
    address: decodeAddr26(instr),
    raw: instr,
    size: 4,
  };
}

// ============================================================================
// ADDRESS TRANSLATION HELPERS
// ============================================================================

export function extractVPN(vaddr: number): number {
  return vaddr >>> PAGE_SHIFT;
}

export function extractOffset(vaddr: number): number {
  return vaddr & (PAGE_SIZE - 1);
}

export function extractPDIndex(vaddr: number): number {
  return (vaddr >>> 22) & 0x3FF;
}

export function extractPTIndex(vaddr: number): number {
  return (vaddr >>> 12) & 0x3FF;
}

export function pteFrame(pte: number): number {
  return pte & PAGE_MASK;
}

export function pteFlags(pte: number): number {
  return pte & ~PAGE_MASK;
}

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

export function formatFlags(flags: number): string {
  const parts: string[] = [];
  if (flags & PTE_PRESENT) parts.push('P');
  if (flags & PTE_WRITABLE) parts.push('W');
  if (flags & PTE_USER) parts.push('U');
  if (flags & PTE_ACCESSED) parts.push('A');
  if (flags & PTE_DIRTY) parts.push('D');
  return parts.join('') || '-';
}

export function formatCPUFlags(flags: number): string {
  const parts: string[] = [];
  if (flags & FLAG_ZERO) parts.push('Z');
  if (flags & FLAG_NEGATIVE) parts.push('N');
  if (flags & FLAG_OVERFLOW) parts.push('V');
  if (flags & FLAG_INTERRUPT) parts.push('I');
  return parts.join('') || '-';
}
