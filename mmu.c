#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "mmu.h"

MMU *mmu_create(void) {
    MMU *mmu = calloc(1, sizeof(MMU));
    if (!mmu) return NULL;

    mmu->phys_mem = calloc(1, PHYS_MEM_SIZE);
    if (!mmu->phys_mem) {
        free(mmu);
        return NULL;
    }

    mmu->phys_size      = PHYS_MEM_SIZE;
    mmu->paging_enabled = 0;
    mmu->cr3            = 0;
    mmu->tlb_next       = 0;
    mmu->tlb_hits       = 0;
    mmu->tlb_misses     = 0;
    mmu->page_faults    = 0;
    mmu->reads          = 0;
    mmu->writes         = 0;

    memset(mmu->frame_bitmap, 0, sizeof(mmu->frame_bitmap));
    memset(mmu->tlb,          0, sizeof(mmu->tlb));

    mmu->frame_bitmap[0] |= 1;

    return mmu;
}

void mmu_destroy(MMU *mmu) {
    if (!mmu) return;
    free(mmu->phys_mem);
    free(mmu);
}

void mmu_reset(MMU *mmu) {
    if (!mmu) return;
    memset(mmu->phys_mem,     0, mmu->phys_size);
    memset(mmu->frame_bitmap, 0, sizeof(mmu->frame_bitmap));
    memset(mmu->tlb,          0, sizeof(mmu->tlb));
    mmu->frame_bitmap[0] |= 1;
    mmu->cr3            = 0;
    mmu->paging_enabled = 0;
    mmu->tlb_next       = 0;
    mmu->tlb_hits       = 0;
    mmu->tlb_misses     = 0;
    mmu->page_faults    = 0;
    mmu->reads          = 0;
    mmu->writes         = 0;
}

void mmu_set_cr3(MMU *mmu, uint32_t pd_paddr) {
    mmu->cr3 = pd_paddr;
    tlb_flush(mmu);
}

void mmu_enable_paging(MMU *mmu, int enable) {
    mmu->paging_enabled = enable;
    if (!enable) tlb_flush(mmu);
}

uint32_t mmu_alloc_frame(MMU *mmu) {
    for (int i = 1; i < FRAME_COUNT; i++) {
        int byte = i / 8;
        int bit  = i % 8;
        if (!(mmu->frame_bitmap[byte] & (1u << bit))) {
            mmu->frame_bitmap[byte] |= (1u << bit);
            uint32_t paddr = i * PAGE_SIZE;
            memset(mmu->phys_mem + paddr, 0, PAGE_SIZE);
            return paddr;
        }
    }
    return 0;
}

void mmu_free_frame(MMU *mmu, uint32_t paddr) {
    uint32_t frame = paddr / PAGE_SIZE;
    if (frame == 0 || frame >= FRAME_COUNT) return;
    int byte = frame / 8;
    int bit  = frame % 8;
    mmu->frame_bitmap[byte] &= ~(1u << bit);
}

int phys_read32(MMU *mmu, uint32_t paddr, uint32_t *out) {
    if (paddr + 4 > mmu->phys_size) return -1;
    memcpy(out, mmu->phys_mem + paddr, 4);
    return 0;
}

int phys_write32(MMU *mmu, uint32_t paddr, uint32_t val) {
    if (paddr + 4 > mmu->phys_size) return -1;
    memcpy(mmu->phys_mem + paddr, &val, 4);
    return 0;
}

int phys_read8(MMU *mmu, uint32_t paddr, uint8_t *out) {
    if (paddr >= mmu->phys_size) return -1;
    *out = mmu->phys_mem[paddr];
    return 0;
}

int phys_write8(MMU *mmu, uint32_t paddr, uint8_t val) {
    if (paddr >= mmu->phys_size) return -1;
    mmu->phys_mem[paddr] = val;
    return 0;
}

uint32_t mmu_read32(MMU *mmu, uint32_t vaddr) {
    mmu->reads++;
    uint32_t paddr = 0;

    if (mmu->paging_enabled) {
        if (paging_translate(mmu, NULL, vaddr, 0, 0, &paddr) < 0)
            return 0;
    } else {
        paddr = vaddr;
    }

    uint32_t val = 0;
    phys_read32(mmu, paddr, &val);
    return val;
}

void mmu_write32(MMU *mmu, uint32_t vaddr, uint32_t value) {
    mmu->writes++;
    uint32_t paddr = 0;

    if (mmu->paging_enabled) {
        if (paging_translate(mmu, NULL, vaddr, 1, 0, &paddr) < 0)
            return;
    } else {
        paddr = vaddr;
    }

    phys_write32(mmu, paddr, value);
}

uint8_t mmu_read8(MMU *mmu, uint32_t vaddr) {
    mmu->reads++;
    uint32_t paddr = 0;

    if (mmu->paging_enabled) {
        if (paging_translate(mmu, NULL, vaddr, 0, 0, &paddr) < 0)
            return 0;
    } else {
        paddr = vaddr;
    }

    uint8_t val = 0;
    phys_read8(mmu, paddr, &val);
    return val;
}

void mmu_write8(MMU *mmu, uint32_t vaddr, uint8_t value) {
    mmu->writes++;
    uint32_t paddr = 0;

    if (mmu->paging_enabled) {
        if (paging_translate(mmu, NULL, vaddr, 1, 0, &paddr) < 0)
            return;
    } else {
        paddr = vaddr;
    }

    phys_write8(mmu, paddr, value);
}

void mmu_flush_tlb(MMU *mmu) {
    tlb_flush(mmu);
}

void mmu_print_stats(MMU *mmu) {
    printf("MMU Stats\n");
    printf("  Reads       : %u\n", mmu->reads);
    printf("  Writes      : %u\n", mmu->writes);
    printf("  TLB Hits    : %u\n", mmu->tlb_hits);
    printf("  TLB Misses  : %u\n", mmu->tlb_misses);
    printf("  Page Faults : %u\n", mmu->page_faults);
    printf("  Paging      : %s\n", mmu->paging_enabled ? "ON" : "OFF");
    printf("  CR3         : 0x%08X\n", mmu->cr3);

    if (mmu->tlb_hits + mmu->tlb_misses > 0) {
        uint32_t total = mmu->tlb_hits + mmu->tlb_misses;
        uint32_t rate  = (mmu->tlb_hits * 100) / total;
        printf("  TLB Hit Rate: %u%%\n", rate);
    }
}