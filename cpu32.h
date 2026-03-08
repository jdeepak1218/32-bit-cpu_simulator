#ifndef CPU_32H
#define CPU_32H
#include "interface.h"
#include<stdint.h>
#include "opcodes32.h"
#include<stdbool.h>
#define NUM_REGISTERS 16
#define FLAG_ZERO (1 << 0)
#define FLAG_NEGATIVE (1 << 1)
#define FLAG_OVERFLOW (1 << 2)
#define FLAG_INTERRUPT (1 << 3)
typedef struct CPU32{
  struct MMU *mmu;
  uint32_t registers[NUM_REGISTERS];
  uint32_t pc;
  uint32_t sp;
  uint32_t flags;
  bool halted;
  uint64_t cycles;
  uint32_t cr3;
  bool interrupt_pending;
  uint8_t interrupt_number;
  uint32_t interrupt_vector[256];
} CPU32;
uint32_t alu32_execute(CPU32 *cpu, Opcode32 op, uint32_t a, uint32_t b);
void cpu32_init(CPU32 *cpu,struct MMU *mmu);
void cpu32_run(CPU32 *cpu);
void cpu32_step(CPU32 *cpu);
void cpu32_raise_interrupt(CPU32 *cpu, uint8_t num);
void cpu32_page_fault(CPU32 *cpu, uint32_t vaddr);
uint32_t mem_read32(CPU32 *cpu,uint32_t address);
void mem_write32(CPU32 *cpu,uint32_t address,uint32_t value);
uint8_t mem_read8(CPU32 *cpu,uint32_t address);
void mem_write8(CPU32 * cpu,uint32_t address,uint8_t value);
#endif
