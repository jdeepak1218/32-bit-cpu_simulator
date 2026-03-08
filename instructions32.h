#ifndef INSTRUCTION_32H
#define INSTRUCTION_32H
#include<stdint.h>
#include "opcodes32.h"
#define DECODE_OPCODE32(instr) ((Opcode32)(((instr) >> 26) & 0x3F))
#define DECODE_DST32(instr) (((instr) >> 22) & 0xF)
#define DECODE_SRC32(instr) (((instr) >> 18) & 0xF)
#define DECODE_IMM18(instr) ((instr) & 0x3FFFF)
#define DECODE_ADDR32(instr) ((instr)& 0x3FFFFFF)
static inline uint32_t ENCODE_REG32(Opcode32 op,uint8_t dest,uint8_t src,uint32_t imm18)
{
  return ((uint32_t)((op & 0x3F) << 26)) | ((uint32_t)((dest & 0xF) << 22)) | ((uint32_t)((src & 0xf) << 18)) | (imm18 & 0x3FFFF);
}
static inline uint32_t ENCODE_JUMP32(Opcode32 op, uint32_t address)
{
  return ((uint32_t)((op & 0x3F) << 26)) | (address & 0x3FFFFFF);
}
#endif
