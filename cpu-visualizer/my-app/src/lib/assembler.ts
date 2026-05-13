/**
 * 32-bit Assembler
 * Translates from C implementation (assembler32.c)
 */

import {
  Opcode,
  OpcodeNames,
  encodeInstruction,
  encodeJump,
  type AssemblyLine,
} from '@/types/cpu';

interface Label {
  name: string;
  address: number;
}

const InstructionFormats: Record<string, { op: Opcode; hasDst: boolean; hasSrc: boolean; hasImm: boolean }> = {
  NOP: { op: Opcode.NOP, hasDst: false, hasSrc: false, hasImm: false },
  HALT: { op: Opcode.HALT, hasDst: false, hasSrc: false, hasImm: false },
  RET: { op: Opcode.RET, hasDst: false, hasSrc: false, hasImm: false },
  STI: { op: Opcode.STI, hasDst: false, hasSrc: false, hasImm: false },
  CLI: { op: Opcode.CLI, hasDst: false, hasSrc: false, hasImm: false },
  IRET: { op: Opcode.IRET, hasDst: false, hasSrc: false, hasImm: false },
  MOV: { op: Opcode.MOV, hasDst: true, hasSrc: true, hasImm: false },
  ADD: { op: Opcode.ADD, hasDst: true, hasSrc: true, hasImm: false },
  SUB: { op: Opcode.SUB, hasDst: true, hasSrc: true, hasImm: false },
  AND: { op: Opcode.AND, hasDst: true, hasSrc: true, hasImm: false },
  OR: { op: Opcode.OR, hasDst: true, hasSrc: true, hasImm: false },
  XOR: { op: Opcode.XOR, hasDst: true, hasSrc: true, hasImm: false },
  NOT: { op: Opcode.NOT, hasDst: true, hasSrc: false, hasImm: false },
  CMP: { op: Opcode.CMP, hasDst: true, hasSrc: true, hasImm: false },
  MUL: { op: Opcode.MUL, hasDst: true, hasSrc: true, hasImm: false },
  DIV: { op: Opcode.DIV, hasDst: true, hasSrc: true, hasImm: false },
  MOD: { op: Opcode.MOD, hasDst: true, hasSrc: true, hasImm: false },
  SHL: { op: Opcode.SHL, hasDst: true, hasSrc: false, hasImm: true },
  SHR: { op: Opcode.SHR, hasDst: true, hasSrc: false, hasImm: true },
  ROL: { op: Opcode.ROL, hasDst: true, hasSrc: true, hasImm: false },
  ROR: { op: Opcode.ROR, hasDst: true, hasSrc: true, hasImm: false },
  SWAP: { op: Opcode.SWAP, hasDst: true, hasSrc: true, hasImm: false },
  LDR: { op: Opcode.LDR, hasDst: true, hasSrc: true, hasImm: false },
  STR: { op: Opcode.STR, hasDst: true, hasSrc: true, hasImm: false },
  LOAD: { op: Opcode.LOAD, hasDst: true, hasSrc: false, hasImm: true },
  PUSH: { op: Opcode.PUSH, hasDst: false, hasSrc: true, hasImm: false },
  POP: { op: Opcode.POP, hasDst: true, hasSrc: false, hasImm: false },
  JMP: { op: Opcode.JMP, hasDst: false, hasSrc: false, hasImm: false },
  JZ: { op: Opcode.JZ, hasDst: false, hasSrc: false, hasImm: false },
  JNZ: { op: Opcode.JNZ, hasDst: false, hasSrc: false, hasImm: false },
  JN: { op: Opcode.JN, hasDst: false, hasSrc: false, hasImm: false },
  JGT: { op: Opcode.JGT, hasDst: false, hasSrc: false, hasImm: false },
  JLT: { op: Opcode.JLT, hasDst: false, hasSrc: false, hasImm: false },
  JGE: { op: Opcode.JGE, hasDst: false, hasSrc: false, hasImm: false },
  JLE: { op: Opcode.JLE, hasDst: false, hasSrc: false, hasImm: false },
  CALL: { op: Opcode.CALL, hasDst: false, hasSrc: false, hasImm: false },
};

function parseRegister(str: string): number {
  const clean = str.trim().replace(',', '');
  const match = clean.match(/^[rR](\d+)$/);
  if (match) {
    const reg = parseInt(match[1], 10);
    if (reg >= 0 && reg <= 15) {
      return reg;
    }
  }
  return -1;
}

function parseImmediate(str: string): number {
  const clean = str.trim().replace(',', '');
  // Handle hex numbers
  if (clean.startsWith('0x') || clean.startsWith('0X')) {
    return parseInt(clean, 16);
  }
  // Handle binary numbers
  if (clean.startsWith('0b') || clean.startsWith('0B')) {
    return parseInt(clean.slice(2), 2);
  }
  // Handle decimal
  return parseInt(clean, 10) || 0;
}

export function assemble(source: string): { machineCode: number[]; assemblyLines: AssemblyLine[]; errors: string[] } {
  const errors: string[] = [];
  const labels: Label[] = [];
  const assemblyLines: AssemblyLine[] = [];
  const machineCode: number[] = [];

  // First pass: collect labels
  const lines = source.split('\n');
  let address = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    // Check for label definition
    const labelMatch = trimmed.match(/^(\w+):\s*$/);
    if (labelMatch) {
      const labelName = labelMatch[1];
      if (labels.find((l) => l.name === labelName)) {
        errors.push(`Duplicate label: ${labelName}`);
      } else {
        labels.push({ name: labelName, address });
      }
      continue;
    }

    // Check for label + instruction on same line
    const labelInstrMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (labelInstrMatch) {
      const labelName = labelInstrMatch[1];
      if (labels.find((l) => l.name === labelName)) {
        errors.push(`Duplicate label: ${labelName}`);
      } else {
        labels.push({ name: labelName, address });
      }
      // Continue to process the instruction part
    }

    // Count instruction
    const instrMatch = trimmed.match(/^([A-Za-z]+)/);
    if (instrMatch) {
      address += 4;
    }
  }

  // Second pass: generate machine code
  address = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith(';')) {
      continue;
    }

    // Skip label-only lines
    if (/^\w+:\s*$/.test(trimmed)) {
      const labelName = trimmed.replace(':', '').trim();
      assemblyLines.push({
        address,
        machineCode: 0,
        source: trimmed,
        label: labelName,
      });
      continue;
    }

    // Extract label if present
    let currentLabel: string | undefined;
    let instrLine = trimmed;
    const labelMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (labelMatch) {
      currentLabel = labelMatch[1];
      instrLine = labelMatch[2];
    }

    // Parse instruction
    const parts = instrLine.split(/[\s,]+/).filter((p) => p);
    if (parts.length === 0) continue;

    const mnemonic = parts[0].toUpperCase();
    const format = InstructionFormats[mnemonic];

    if (!format) {
      errors.push(`Unknown instruction: ${mnemonic} on line ${lineNum + 1}`);
      address += 4;
      continue;
    }

    let machineWord = 0;

    if (mnemonic === 'CALL' || mnemonic.startsWith('J')) {
      // Jump/CALL instruction
      let target = 0;
      if (parts[1]) {
        const label = labels.find((l) => l.name === parts[1]);
        if (label) {
          target = label.address;
        } else {
          // Try parsing as number
          target = parseImmediate(parts[1]);
        }
      }
      machineWord = encodeJump(format.op, target);
    } else {
      // Regular instruction
      let dst = 0;
      let src = 0;
      let imm = 0;

      let argIdx = 1;

      if (format.hasDst && argIdx < parts.length) {
        const reg = parseRegister(parts[argIdx]);
        if (reg >= 0) {
          dst = reg;
        } else {
          errors.push(`Invalid register: ${parts[argIdx]} on line ${lineNum + 1}`);
        }
        argIdx++;
      }

      if (format.hasSrc && argIdx < parts.length) {
        const reg = parseRegister(parts[argIdx]);
        if (reg >= 0) {
          src = reg;
        } else {
          // For instructions that expect a register, but got something else
          errors.push(`Invalid register: ${parts[argIdx]} on line ${lineNum + 1}`);
        }
        argIdx++;
      }

      if (format.hasImm && argIdx < parts.length) {
        imm = parseImmediate(parts[argIdx]);
        if (imm < -131072 || imm > 131071) {
          errors.push(`Immediate value out of range: ${imm} on line ${lineNum + 1}`);
        }
      }

      machineWord = encodeInstruction(format.op, dst, src, imm);
    }

    machineCode.push(machineWord);
    assemblyLines.push({
      address,
      machineCode: machineWord,
      source: instrLine,
      label: currentLabel,
    });
    address += 4;
  }

  return { machineCode, assemblyLines, errors };
}

export function disassemble(machineCode: number): string {
  const { opcode, mnemonic, dst, src, imm, address } = disassembleToParts(machineCode);

  // Check if it's a jump instruction
  if (opcode >= Opcode.JMP && opcode <= Opcode.CALL) {
    return `${mnemonic} 0x${address.toString(16)}`;
  }

  // Build argument string
  const args: string[] = [];

  // Check instruction format
  const format = InstructionFormats[mnemonic];
  if (!format) return `${mnemonic} ???`;

  if (format.hasDst) {
    args.push(`R${dst}`);
  }
  if (format.hasSrc) {
    args.push(`R${src}`);
  }
  if (format.hasImm) {
    if (mnemonic === 'LOAD') {
      args.push(`${imm}`);
    } else {
      args.push(`${imm}`);
    }
  }

  return `${mnemonic} ${args.join(', ')}`;
}

export function disassembleToParts(machineCode: number) {
  const opcode = ((machineCode >>> 26) & 0x3F) as Opcode;
  const dst = (machineCode >>> 22) & 0xF;
  const src = (machineCode >>> 18) & 0xF;
  const imm = machineCode & 0x3FFFF;
  const address = machineCode & 0x3FFFFFF;

  // Sign extend immediate
  const signExtendedImm = (imm & 0x20000) ? (imm | 0xFFFC0000) : imm;

  return {
    opcode,
    mnemonic: OpcodeNames[opcode] || 'UNKNOWN',
    dst,
    src,
    imm: signExtendedImm,
    address,
    raw: machineCode,
  };
}

// Example programs
export const EXAMPLE_PROGRAMS = {
  simpleAdd: `; Simple addition example
LOAD R0, 10      ; R0 = 10
LOAD R1, 20      ; R1 = 20
ADD R0, R1       ; R0 = R0 + R1 = 30
HALT`,

  factorial: `; Factorial calculation (5! = 120)
LOAD R0, 1       ; result = 1
LOAD R1, 5       ; counter = 5
LOAD R2, 1       ; const 1
loop:
MUL R0, R1       ; result *= counter
SUB R1, R2       ; counter--
CMP R1, R2       ; compare counter with 1
JGE loop         ; if counter >= 1, continue
HALT             ; R0 = 120`,

  memoryTest: `; Test memory operations
LOAD R0, 0x1000  ; Address to store/load
LOAD R1, 0xDEAD  ; Value to store
STR R0, R1       ; Store R1 at address in R0
LDR R2, R0       ; Load from address in R0 to R2
HALT`,

  fibonacci: `; Fibonacci sequence (first 10 numbers)
LOAD R0, 10      ; count = 10
LOAD R1, 0       ; a = 0
LOAD R2, 1       ; b = 1
LOAD R6, 0x1000  ; memory base address
fib_loop:
CMP R0, 0        ; if count == 0
JZ done
STR R6, R1       ; store a
ADD R6, 4        ; addr += 4
MOV R3, R2       ; temp = b
ADD R2, R1       ; b = b + a
MOV R1, R3       ; a = temp
SUB R0, 1        ; count--
JMP fib_loop
done:
HALT`,

  tlbThrashing: `; TLB thrashing demonstration
; Accesses multiple pages to cause TLB misses
LOAD R0, 0       ; base address
LOAD R1, 64      ; number of pages to access
LOAD R2, 0x1000  ; page size
LOAD R3, 0       ; counter
thrash_loop:
CMP R3, R1
JZ done
MOV R4, R3
MUL R4, R2       ; offset = counter * page_size
ADD R4, R0       ; address = base + offset
LOAD R5, 0xAA    ; value to store
STR R4, R5       ; store to different page
ADD R3, 1
JMP thrash_loop
done:
HALT`,

  recursiveFib: `; Recursive Fibonacci - demonstrates stack usage
; fib(n) in R0
LOAD R0, 8       ; Calculate fib(8) = 21
CALL fib
HALT

fib:
; if n <= 1, return n
LOAD R1, 1
CMP R0, R1
JGT fib_recurse
RET

fib_recurse:
; Save R0 (n)
PUSH R0
SUB R0, 1
CALL fib         ; fib(n-1)
MOV R1, R0       ; R1 = result
POP R0           ; restore n
PUSH R1          ; save fib(n-1)
SUB R0, 2
CALL fib         ; fib(n-2)
POP R1           ; R1 = fib(n-1)
ADD R0, R1       ; R0 = fib(n-1) + fib(n-2)
RET`,

  interrupts: `; Interrupt demonstration
; Must run with paging enabled
STI              ; Enable interrupts
LOAD R0, 0
LOAD R1, 1
DIV R1, R0       ; Division by zero - triggers interrupt
HALT`,

  pageFaultDemo: `; Page fault demonstration
; This will cause a page fault when run
; because it accesses unmapped memory
LOAD R0, 0x80000000  ; Unmapped address
LDR R1, R0           ; This will cause page fault
HALT`,
};
