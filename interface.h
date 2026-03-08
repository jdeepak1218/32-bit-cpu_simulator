#ifndef INTERFACE_H
#define INTERFACE_H

#include <stdint.h>

typedef struct CPU32 CPU32;
typedef struct MMU MMU;

MMU     *mmu_create(void);
void     mmu_destroy(MMU *mmu);
void     mmu_reset(MMU *mmu);
void     mmu_set_cr3(MMU *mmu, uint32_t pd_paddr);
void     mmu_enable_paging(MMU *mmu, int enable);
uint32_t mmu_read32(MMU *mmu, uint32_t vaddr);
void     mmu_write32(MMU *mmu, uint32_t vaddr, uint32_t value);
uint8_t  mmu_read8(MMU *mmu, uint32_t vaddr);
void     mmu_write8(MMU *mmu, uint32_t vaddr, uint8_t value);
void     mmu_flush_tlb(MMU *mmu);
void     mmu_print_stats(MMU *mmu);
uint32_t mmu_alloc_frame(MMU *mmu);
void     mmu_free_frame(MMU *mmu, uint32_t paddr);
int      mmu_map_page(MMU *mmu, uint32_t vaddr, uint32_t paddr, uint32_t flags);
int      mmu_unmap_page(MMU *mmu, uint32_t vaddr);

void     cpu32_raise_interrupt(CPU32 *cpu, uint8_t num);
void     cpu32_page_fault(CPU32 *cpu, uint32_t vaddr);

#endif