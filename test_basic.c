#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include "mmu.h"
#include "cpu32.h"

int main(void) {
    MMU *mmu = mmu_create();
    if (!mmu) { printf("MMU create failed\n"); return 2; }

    CPU32 cpu;
    cpu32_init(&cpu, mmu);

    uint32_t pd = mmu_alloc_frame(mmu);
    mmu_set_cr3(mmu, pd);
    mmu_enable_paging(mmu, 1);

    // Test A: basic map/read/write
    uint32_t vaddr = 0x1000;
    uint32_t pframe = mmu_alloc_frame(mmu);
    if (!pframe) { printf("alloc frame failed\n"); return 2; }
    if (mmu_map_page(mmu, vaddr, pframe, PTE_WRITABLE | PTE_USER) != 0) {
        printf("map page failed\n"); return 2;
    }
    mem_write32(&cpu, vaddr, 0xDEADBEEF);
    uint32_t val = mem_read32(&cpu, vaddr);
    if (val != 0xDEADBEEF) { printf("FAIL A: expected 0xDEADBEEF got 0x%08X\n", val); return 1; }
    printf("PASS A: basic read/write\n");

    // Test B: TLB insertion and size
    tlb_flush(mmu);
    int n = TLB_ENTRIES + 5;
    for (int i = 0; i < n; i++) {
        printf("B: iter %d\n", i);
        fflush(stdout);
        uint32_t va = 0x2000 + i * PAGE_SIZE;
        uint32_t pf = mmu_alloc_frame(mmu);
        if (!pf) { printf("FAIL B: alloc frame failed at i=%d\n", i); return 1; }
        if (mmu_map_page(mmu, va, pf, PTE_WRITABLE | PTE_USER) != 0) { printf("FAIL B: map failed at i=%d\n", i); return 1; }
        mem_write32(&cpu, va, 0x100 + i);
        uint32_t r = mem_read32(&cpu, va);
        if (r != (uint32_t)(0x100 + i)) { printf("FAIL B: mem mismatch at i=%d\n", i); return 1; }
    }
    int valid_count = 0;
    for (int i = 0; i < TLB_ENTRIES; i++) if (mmu->tlb[i].valid) valid_count++;
    if (valid_count > TLB_ENTRIES) { printf("FAIL B: tlb too many valid\n"); return 1; }
    printf("PASS B: TLB exercised, valid entries = %d (<= %d)\n", valid_count, TLB_ENTRIES);

    // Test C: page fault triggers interrupt when INTERRUPT flag enabled
    uint32_t bad_v = 0x80000000;
    // enable interrupts in CPU so cpu32_raise_interrupt can set pending
    cpu.flags |= FLAG_INTERRUPT;
    uint32_t before_pf = mmu->page_faults;
    mem_read32(&cpu, bad_v);
    if (mmu->page_faults == before_pf) { printf("FAIL C: expected page fault increment\n"); return 1; }
    if (!cpu.interrupt_pending || cpu.interrupt_number != 14) {
        // If interrupt not pending, that's still acceptable if flags were not set; but we set flag.
        printf("FAIL C: expected interrupt pending on page fault\n"); return 1; }
    printf("PASS C: page fault produced and interrupt queued\n");

    // Test D: write-protection fault
    uint32_t vwp = 0x9000;
    uint32_t pf2 = mmu_alloc_frame(mmu);
    mmu_map_page(mmu, vwp, pf2, PTE_USER /* no WRITABLE */);
    uint32_t before_pf2 = mmu->page_faults;
    mem_write32(&cpu, vwp, 0xCAFEBABE);
    if (mmu->page_faults == before_pf2) { printf("FAIL D: expected page fault on write-protect\n"); return 1; }
    printf("PASS D: write-protection fault detected\n");

    // Summarize
    printf("MMU stats: reads=%u writes=%u tlb_hits=%u tlb_misses=%u page_faults=%u\n",
        mmu->reads, mmu->writes, mmu->tlb_hits, mmu->tlb_misses, mmu->page_faults);

    mmu_destroy(mmu);
    return 0;
}
