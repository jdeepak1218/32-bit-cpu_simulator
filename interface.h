#ifndef INTERFACE_H
#define INTERFACE_H
#include<stdint.h>
typedef struct CPU32 CPU32;
typedef struct MMU MMU;
// MMU functions implemented by ritesh
uint32_t mmu_read32(MMU *mmu,uint32_t vaddr);
void mmu_write32(MMU *mmu,uint32_t vaddr,uint32_t value);
uint8_t mmu_read8(MMU *mmu,uint32_t vaddr);
void mmu_write8(MMU *mmu,uint32_t vaddr,uint8_t value);
void mmu_flush_tlb(MMU *mmu);
void mmu_print_stats(MMU *mmu);

//CPU functions implemented by deepak
void cpu32_raise_interrupt(CPU32 *cpu,uint8_t num);
void cpu32_page_fault(CPU32 *cpu,uint32_t vaddr);
#endif // INTERFACE_H
