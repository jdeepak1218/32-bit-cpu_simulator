/**
 * 32-bit Assembler
 * Translated from C implementation (assembler32.c)
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

function parseRegister(str: string): number {
  if (!str) return -1;
  const clean = str.trim().replace(/,$/, '').trim();
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
  if (!str) return 0;
  const clean = str.trim().replace(/,$/, '').trim();
  if (clean.startsWith('0x') || clean.startsWith('0X')) {
    return parseInt(clean, 16);
  }
  if (clean.startsWith('0b') || clean.startsWith('0B')) {
    return parseInt(clean.slice(2), 2);
  }
  return parseInt(clean, 10) || 0;
}

function parseLineArgs(line: string): { mnemonic: string; arg1: string; arg2: string } {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\S+)\s+(\S+)\s*,\s*(\S+)/);
  if (match) {
    return { mnemonic: match[1].toUpperCase(), arg1: match[2], arg2: match[3] };
  }
  const match2 = trimmed.match(/^(\S+)\s+(\S+)/);
  if (match2) {
    return { mnemonic: match2[1].toUpperCase(), arg1: match2[2], arg2: '' };
  }
  const match3 = trimmed.match(/^(\S+)/);
  if (match3) {
    return { mnemonic: match3[1].toUpperCase(), arg1: '', arg2: '' };
  }
  return { mnemonic: '', arg1: '', arg2: '' };
}

export function assemble(source: string): { machineCode: number[]; assemblyLines: AssemblyLine[]; errors: string[] } {
  const errors: string[] = [];
  const labels: Label[] = [];
  const assemblyLines: AssemblyLine[] = [];
  const machineCode: number[] = [];

  const lines = source.split('\n');
  let address = 0;

  // First pass: collect labels
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    const labelMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (labelMatch) {
      const labelName = labelMatch[1];
      const rest = labelMatch[2].trim();

      if (labels.find((l) => l.name === labelName)) {
        errors.push(`Duplicate label: ${labelName}`);
      } else {
        labels.push({ name: labelName, address });
      }

      if (!rest || rest.startsWith(';')) {
        continue;
      }
    }

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

    let currentLabel: string | undefined;
    let instrLine = trimmed;

    const labelMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (labelMatch) {
      currentLabel = labelMatch[1];
      const rest = labelMatch[2].trim();
      if (!rest || rest.startsWith(';')) {
        assemblyLines.push({
          address,
          machineCode: 0,
          source: trimmed,
          label: currentLabel,
        });
        continue;
      }
      instrLine = rest;
    }

    const { mnemonic, arg1, arg2 } = parseLineArgs(instrLine);

    if (!mnemonic) {
      continue;
    }

    let machineWord = 0;

    switch (mnemonic) {
      case 'NOP':
      case 'HALT':
      case 'RET':
      case 'STI':
      case 'CLI':
      case 'IRET': {
        const opMap: Record<string, Opcode> = {
          NOP: Opcode.NOP, HALT: Opcode.HALT, RET: Opcode.RET,
          STI: Opcode.STI, CLI: Opcode.CLI, IRET: Opcode.IRET,
        };
        machineWord = encodeInstruction(opMap[mnemonic], 0, 0, 0);
        break;
      }

      case 'MOV':
      case 'ADD':
      case 'SUB':
      case 'AND':
      case 'OR':
      case 'XOR':
      case 'CMP':
      case 'MUL':
      case 'DIV':
      case 'MOD':
      case 'ROL':
      case 'ROR':
      case 'SWAP':
      case 'LDR':
      case 'STR': {
        const opMap: Record<string, Opcode> = {
          MOV: Opcode.MOV, ADD: Opcode.ADD, SUB: Opcode.SUB,
          AND: Opcode.AND, OR: Opcode.OR, XOR: Opcode.XOR,
          CMP: Opcode.CMP, MUL: Opcode.MUL, DIV: Opcode.DIV,
          MOD: Opcode.MOD, ROL: Opcode.ROL, ROR: Opcode.ROR,
          SWAP: Opcode.SWAP, LDR: Opcode.LDR, STR: Opcode.STR,
        };
        const dst = parseRegister(arg1);
        const src = parseRegister(arg2);
        if (dst < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        if (src < 0) errors.push(`Invalid register: ${arg2} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(opMap[mnemonic], dst >= 0 ? dst : 0, src >= 0 ? src : 0, 0);
        break;
      }

      case 'NOT': {
        const dst = parseRegister(arg1);
        if (dst < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(Opcode.NOT, dst >= 0 ? dst : 0, 0, 0);
        break;
      }

      case 'SHL':
      case 'SHR': {
        const dst = parseRegister(arg1);
        const imm = parseImmediate(arg2);
        if (dst < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(
          mnemonic === 'SHL' ? Opcode.SHL : Opcode.SHR,
          dst >= 0 ? dst : 0, 0, imm
        );
        break;
      }

      case 'LOAD': {
        const dst = parseRegister(arg1);
        const imm = parseImmediate(arg2);
        if (dst < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(Opcode.LOAD, dst >= 0 ? dst : 0, 0, imm);
        break;
      }

      case 'PUSH': {
        const src = parseRegister(arg1);
        if (src < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(Opcode.PUSH, 0, src >= 0 ? src : 0, 0);
        break;
      }

      case 'POP': {
        const dst = parseRegister(arg1);
        if (dst < 0) errors.push(`Invalid register: ${arg1} on line ${lineNum + 1}`);
        machineWord = encodeInstruction(Opcode.POP, dst >= 0 ? dst : 0, 0, 0);
        break;
      }

      case 'CALL':
      case 'JMP':
      case 'JZ':
      case 'JNZ':
      case 'JN':
      case 'JGT':
      case 'JLT':
      case 'JGE':
      case 'JLE': {
        const opMap: Record<string, Opcode> = {
          CALL: Opcode.CALL, JMP: Opcode.JMP, JZ: Opcode.JZ,
          JNZ: Opcode.JNZ, JN: Opcode.JN, JGT: Opcode.JGT,
          JLT: Opcode.JLT, JGE: Opcode.JGE, JLE: Opcode.JLE,
        };
        let target = 0;
        const label = labels.find((l) => l.name === arg1);
        if (label) {
          target = label.address;
        } else if (arg1) {
          target = parseImmediate(arg1);
        }
        machineWord = encodeJump(opMap[mnemonic], target);
        break;
      }

      default:
        errors.push(`Unknown instruction: ${mnemonic} on line ${lineNum + 1}`);
        break;
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

  if (opcode >= Opcode.JMP && opcode <= Opcode.CALL) {
    return `${mnemonic} 0x${address.toString(16)}`;
  }

  const args: string[] = [];

  switch (mnemonic) {
    case 'NOP':
    case 'HALT':
    case 'RET':
    case 'STI':
    case 'CLI':
    case 'IRET':
      return mnemonic;

    case 'MOV':
    case 'ADD':
    case 'SUB':
    case 'AND':
    case 'OR':
    case 'XOR':
    case 'CMP':
    case 'MUL':
    case 'DIV':
    case 'MOD':
    case 'ROL':
    case 'ROR':
    case 'SWAP':
    case 'LDR':
    case 'STR':
      return `${mnemonic} R${dst}, R${src}`;

    case 'NOT':
      return `${mnemonic} R${dst}`;

    case 'SHL':
    case 'SHR':
      return `${mnemonic} R${dst}, ${imm}`;

    case 'LOAD':
      return `${mnemonic} R${dst}, ${imm}`;

    case 'PUSH':
      return `${mnemonic} R${src}`;

    case 'POP':
      return `${mnemonic} R${dst}`;

    default:
      return `${mnemonic} ???`;
  }
}

export function disassembleToParts(machineCode: number) {
  const opcode = ((machineCode >>> 26) & 0x3F) as Opcode;
  const dst = (machineCode >>> 22) & 0xF;
  const src = (machineCode >>> 18) & 0xF;
  const imm = machineCode & 0x3FFFF;
  const address = machineCode & 0x3FFFFFF;

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
LOAD R3, 4       ; increment by 4
ADD R6, R3       ; addr += 4
MOV R3, R2       ; temp = b
ADD R2, R1       ; b = b + a
MOV R1, R3       ; a = temp
LOAD R3, 1       ; decrement by 1
SUB R0, R3       ; count--
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
LOAD R5, 1
ADD R3, R5
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
LOAD R1, 1
SUB R0, R1
CALL fib         ; fib(n-1)
MOV R1, R0       ; R1 = result
POP R0           ; restore n
PUSH R1          ; save fib(n-1)
LOAD R1, 2
SUB R0, R1
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
