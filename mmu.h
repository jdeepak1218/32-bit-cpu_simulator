#ifndef MMU_H
#define MMU_H

#include <stdint.h>
#include <stddef.h>
#include "interface.h"

#define PAGE_SIZE         4096
#define PAGE_SHIFT        12
#define PAGE_MASK         0xFFFFF000
#define PD_ENTRIES        1024
#define PT_ENTRIES        1024
#define PHYS_MEM_SIZE     (64 * 1024 * 1024)
#define FRAME_COUNT       (PHYS_MEM_SIZE / PAGE_SIZE)

#define PTE_PRESENT       (1u << 0)
#define PTE_WRITABLE      (1u << 1)
#define PTE_USER          (1u << 2)
#define PTE_ACCESSED      (1u << 3)
#define PTE_DIRTY         (1u << 4)

#define PTE_FRAME(pte)    ((pte) & PAGE_MASK)
#define PTE_FLAGS(pte)    ((pte) & ~PAGE_MASK)

#define TLB_ENTRIES       64

typedef struct {
    uint32_t vpn;
    uint32_t paddr;
    uint32_t flags;
    int      valid;
} TLBEntry;

typedef struct MMU {
    uint8_t  *phys_mem;
    size_t    phys_size;
    uint8_t   frame_bitmap[FRAME_COUNT / 8];
    uint32_t  cr3;
    int       paging_enabled;
    TLBEntry  tlb[TLB_ENTRIES];
    int       tlb_next;
    uint32_t  tlb_hits;
    uint32_t  tlb_misses;
    uint32_t  page_faults;
    uint32_t  reads;
    uint32_t  writes;
    uint32_t  fault_addr;
    uint32_t  fault_flags;
} MMU;

MMU     *mmu_create(void);
void     mmu_destroy(MMU *mmu);
void     mmu_reset(MMU *mmu);
void     mmu_set_cr3(MMU *mmu, uint32_t pd_paddr);
void     mmu_enable_paging(MMU *mmu, int enable);

int      phys_read32 (MMU *mmu, uint32_t paddr, uint32_t *out);
int      phys_write32(MMU *mmu, uint32_t paddr, uint32_t  val);
int      phys_read8  (MMU *mmu, uint32_t paddr, uint8_t  *out);
int      phys_write8 (MMU *mmu, uint32_t paddr, uint8_t   val);

uint32_t mmu_alloc_frame(MMU *mmu);
void     mmu_free_frame (MMU *mmu, uint32_t paddr);

int      mmu_map_page  (MMU *mmu, uint32_t vaddr,
                        uint32_t paddr, uint32_t flags);
int      mmu_unmap_page(MMU *mmu, uint32_t vaddr);

TLBEntry *tlb_lookup    (MMU *mmu, uint32_t vpn);
void      tlb_insert    (MMU *mmu, uint32_t vpn,
                         uint32_t paddr, uint32_t flags);
void      tlb_flush     (MMU *mmu);
void      tlb_invalidate(MMU *mmu, uint32_t vpn);

int      paging_translate(MMU *mmu, CPU32 *cpu,
                          uint32_t vaddr, int write, int user,
                          uint32_t *out_paddr);

#endif