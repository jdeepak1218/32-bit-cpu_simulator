#include <string.h>
#include <stdio.h>
#include "mmu.h"

TLBEntry *tlb_lookup(MMU *mmu, uint32_t vpn) {
    for (int i = 0; i < TLB_ENTRIES; i++) {
        if (mmu->tlb[i].valid && mmu->tlb[i].vpn == vpn) {
            mmu->tlb_hits++;
            return &mmu->tlb[i];
        }
    }
    mmu->tlb_misses++;
    return NULL;
}

void tlb_insert(MMU *mmu, uint32_t vpn, uint32_t paddr, uint32_t flags) {
    int i = mmu->tlb_next;
    mmu->tlb[i].vpn   = vpn;
    mmu->tlb[i].paddr = paddr;
    mmu->tlb[i].flags = flags;
    mmu->tlb[i].valid = 1;
    mmu->tlb_next = (mmu->tlb_next + 1) % TLB_ENTRIES;
}

void tlb_flush(MMU *mmu) {
    memset(mmu->tlb, 0, sizeof(mmu->tlb));
    mmu->tlb_next = 0;
}

void tlb_invalidate(MMU *mmu, uint32_t vpn) {
    for (int i = 0; i < TLB_ENTRIES; i++) {
        if (mmu->tlb[i].valid && mmu->tlb[i].vpn == vpn) {
            mmu->tlb[i].valid = 0;
            return;
        }
    }
}