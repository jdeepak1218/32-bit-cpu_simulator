#include <stdio.h>
#include <stdint.h>
#include "cpu32.h"
#include "opcodes32.h"
#include "instructions32.h"
void cpu32_step(CPU32 *cpu)
{
  if(cpu->halted)return;
  if(cpu->interrupt_pending)
  {
    cpu->sp-=4;
    mem_write32(cpu,cpu->sp,cpu->pc);
    cpu->sp-=4;
    mem_write32(cpu,cpu->sp,cpu->flags);
    cpu->flags &= ~FLAG_INTERRUPT;
    cpu->pc = cpu->interrupt_vector[cpu->interrupt_number];
    cpu->interrupt_pending = false;
    return;
  }
  uint32_t instr = mem_read32(cpu,cpu->pc);
  Opcode32 op = DECODE_OPCODE32(instr);
  uint8_t dst = DECODE_DST32(instr);
  uint8_t src = DECODE_SRC32(instr);
  uint32_t imm = DECODE_IMM18(instr);
  switch(op){
    case OP_NOP:
    break;
    case OP_HALT:
    cpu->halted = true;
    break;
    case OP_MOV:
    cpu->registers[dst] = cpu->registers[src];
    break;
    case OP_ADD:
    case OP_SUB:
    case OP_AND:
    case OP_DIV:
    case OP_MOD:
    case OP_OR:
    case OP_XOR:
    case OP_MUL:
    case OP_SHL:
    case OP_SHR:
    case OP_ROL:
    case OP_ROR:
    cpu->registers[dst] = alu32_execute(cpu,op,cpu->registers[dst],cpu->registers[src]);
    break;
    case OP_NOT:
    cpu->registers[dst] = alu32_execute(cpu,op,cpu->registers[dst],0);
    break;
    case OP_CMP:
    alu32_execute(cpu, op, cpu->registers[dst], cpu->registers[src]);
    break;
    case OP_JMP:
    cpu->pc = imm;
    cpu->cycles++;
    return;
    case OP_JZ:
    if(cpu->flags & FLAG_ZERO)
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JNZ:
    if(!(cpu->flags & FLAG_ZERO))
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JN:
    if(cpu->flags & FLAG_NEGATIVE)
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JGT:
    if(!(cpu->flags & FLAG_ZERO) && !(cpu->flags & FLAG_NEGATIVE))
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JLT:
    if(cpu->flags & FLAG_NEGATIVE)
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JGE:
    if(!(cpu->flags & FLAG_NEGATIVE))
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_JLE:
    if(cpu->flags & FLAG_ZERO || cpu->flags & FLAG_NEGATIVE)
    {
      cpu->pc = imm;
      cpu->cycles++;
      return;
    }
    break;
    case OP_LOAD:
    cpu->registers[dst] = imm;
    break;
    case OP_LDR:
    cpu->registers[dst] = mem_read32(cpu,cpu->registers[src]);
    break;
    case OP_STR:
    mem_write32(cpu,cpu->registers[dst],cpu->registers[src]);
    break;
    case OP_PUSH:
    cpu->sp -= 4;
    mem_write32(cpu,cpu->sp,cpu->registers[src]);
    break;
    case OP_POP:
    cpu->registers[dst]=mem_read32(cpu,cpu->sp);
    cpu->sp+=4;
    break;
    case OP_RET:
    cpu->pc = mem_read32(cpu,cpu->sp);
    cpu->sp += 4;
    cpu->cycles++;
    return;
    case OP_CALL:
    cpu->sp -= 4;
    mem_write32(cpu, cpu->sp, cpu->pc + 4);
    cpu->pc = imm;
    cpu->cycles++;
    return;
    case OP_STI:
    cpu->flags |= FLAG_INTERRUPT;
    break;
    case OP_CLI:
    cpu->flags &= ~FLAG_INTERRUPT;
    break;
    case OP_IRET:
    cpu->flags = mem_read32(cpu,cpu->sp);
    cpu->sp+=4;
    cpu->pc = mem_read32(cpu,cpu->sp);
    cpu->sp+=4;
    cpu->cycles++;
    return;
    case OP_SWAP:{
    uint32_t temp = cpu->registers[dst];
    cpu->registers[dst] = cpu->registers[src];
    cpu->registers[src] = temp;
    break;
    }
    default:
    fprintf(stderr,"Unknown opcode : 0x%X  at PC : 0x%X",op,cpu->pc);
    cpu->halted = true;
    break;
  }
  cpu->pc += 4;
  cpu->cycles++;
}
