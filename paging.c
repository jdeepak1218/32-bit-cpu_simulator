#include <string.h>
#include <stdio.h>
#include "mmu.h"

int paging_translate(MMU *mmu, CPU32 *cpu,
                     uint32_t vaddr, int write, int user,
                     uint32_t *out_paddr) {

    if (!mmu->paging_enabled) {
        *out_paddr = vaddr;
        return 0;
    }

    uint32_t vpn    = vaddr >> PAGE_SHIFT;
    uint32_t offset = vaddr &  (PAGE_SIZE - 1);

    TLBEntry *te = tlb_lookup(mmu, vpn);
    if (te) {
        if (write && !(te->flags & PTE_WRITABLE)) {
            mmu->fault_addr  = vaddr;
            mmu->fault_flags = PTE_WRITABLE;
            mmu->page_faults++;
            cpu32_page_fault(cpu, vaddr);
            return -1;
        }
        if (user && !(te->flags & PTE_USER)) {
            mmu->fault_addr  = vaddr;
            mmu->fault_flags = PTE_USER;
            mmu->page_faults++;
            cpu32_page_fault(cpu, vaddr);
            return -1;
        }
        *out_paddr = te->paddr | offset;
        return 0;
    }

    uint32_t pd_idx   = (vaddr >> 22) & 0x3FF;
    uint32_t pt_idx   = (vaddr >> 12) & 0x3FF;

    uint32_t pde_addr = mmu->cr3 + pd_idx * 4;
    if (pde_addr + 4 > mmu->phys_size) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = 0;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    uint32_t pde;
    memcpy(&pde, mmu->phys_mem + pde_addr, 4);

    if (!(pde & PTE_PRESENT)) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = 0;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    uint32_t pt_base  = PTE_FRAME(pde);
    uint32_t pte_addr = pt_base + pt_idx * 4;

    if (pte_addr + 4 > mmu->phys_size) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = 0;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    uint32_t pte;
    memcpy(&pte, mmu->phys_mem + pte_addr, 4);

    if (!(pte & PTE_PRESENT)) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = 0;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    if (write && !(pte & PTE_WRITABLE)) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = PTE_WRITABLE;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    if (user && !(pte & PTE_USER)) {
        mmu->fault_addr  = vaddr;
        mmu->fault_flags = PTE_USER;
        mmu->page_faults++;
        cpu32_page_fault(cpu, vaddr);
        return -1;
    }

    pte |= PTE_ACCESSED;
    if (write) pte |= PTE_DIRTY;
    memcpy(mmu->phys_mem + pte_addr, &pte, 4);

    uint32_t frame = PTE_FRAME(pte);
    tlb_insert(mmu, vpn, frame, PTE_FLAGS(pte));

    *out_paddr = frame | offset;
    return 0;
}

int mmu_map_page(MMU *mmu, uint32_t vaddr,
                 uint32_t paddr, uint32_t flags) {

    uint32_t pd_idx   = (vaddr >> 22) & 0x3FF;
    uint32_t pt_idx   = (vaddr >> 12) & 0x3FF;
    uint32_t pde_addr = mmu->cr3 + pd_idx * 4;

    uint32_t pde;
    memcpy(&pde, mmu->phys_mem + pde_addr, 4);

    if (!(pde & PTE_PRESENT)) {
        uint32_t pt_frame = mmu_alloc_frame(mmu);
        if (!pt_frame) return -1;
        pde = pt_frame | PTE_PRESENT | PTE_WRITABLE | PTE_USER;
        memcpy(mmu->phys_mem + pde_addr, &pde, 4);
    }

    uint32_t pt_base  = PTE_FRAME(pde);
    uint32_t pte_addr = pt_base + pt_idx * 4;
    uint32_t pte      = (paddr & PAGE_MASK) | (flags | PTE_PRESENT);
    memcpy(mmu->phys_mem + pte_addr, &pte, 4);

    tlb_invalidate(mmu, vaddr >> PAGE_SHIFT);
    return 0;
}

int mmu_unmap_page(MMU *mmu, uint32_t vaddr) {
    uint32_t pd_idx   = (vaddr >> 22) & 0x3FF;
    uint32_t pt_idx   = (vaddr >> 12) & 0x3FF;
    uint32_t pde_addr = mmu->cr3 + pd_idx * 4;

    uint32_t pde;
    memcpy(&pde, mmu->phys_mem + pde_addr, 4);
    if (!(pde & PTE_PRESENT)) return -1;

    uint32_t pt_base  = PTE_FRAME(pde);
    uint32_t pte_addr = pt_base + pt_idx * 4;

    uint32_t pte;
    memcpy(&pte, mmu->phys_mem + pte_addr, 4);
    if (!(pte & PTE_PRESENT)) return -1;

    mmu_free_frame(mmu, PTE_FRAME(pte));

    pte = 0;
    memcpy(mmu->phys_mem + pte_addr, &pte, 4);

    tlb_invalidate(mmu, vaddr >> PAGE_SHIFT);
    return 0;
}