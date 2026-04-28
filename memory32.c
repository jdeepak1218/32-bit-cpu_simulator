#include <stdint.h>
#include "mmu.h"
#include "cpu32.h"

uint32_t mem_read32(CPU32 *cpu, uint32_t vaddr)
{
    MMU *mmu = cpu->mmu;
    mmu->reads++;
    uint32_t paddr = 0;
    if (mmu->paging_enabled) {
        if (paging_translate(mmu, cpu, vaddr, 0, 0, &paddr) < 0)
            return 0;
    } else {
        paddr = vaddr;
    }
    uint32_t val = 0;
    phys_read32(mmu, paddr, &val);
    return val;
}

void mem_write32(CPU32 *cpu, uint32_t vaddr, uint32_t value)
{
    MMU *mmu = cpu->mmu;
    mmu->writes++;
    uint32_t paddr = 0;
    if (mmu->paging_enabled) {
        if (paging_translate(mmu, cpu, vaddr, 1, 0, &paddr) < 0)
            return;
    } else {
        paddr = vaddr;
    }
    phys_write32(mmu, paddr, value);
}

uint8_t mem_read8(CPU32 *cpu, uint32_t vaddr)
{
    MMU *mmu = cpu->mmu;
    mmu->reads++;
    uint32_t paddr = 0;
    if (mmu->paging_enabled) {
        if (paging_translate(mmu, cpu, vaddr, 0, 0, &paddr) < 0)
            return 0;
    } else {
        paddr = vaddr;
    }
    uint8_t val = 0;
    phys_read8(mmu, paddr, &val);
    return val;
}

void mem_write8(CPU32 * cpu, uint32_t vaddr, uint8_t value)
{
    MMU *mmu = cpu->mmu;
    mmu->writes++;
    uint32_t paddr = 0;
    if (mmu->paging_enabled) {
        if (paging_translate(mmu, cpu, vaddr, 1, 0, &paddr) < 0)
            return;
    } else {
        paddr = vaddr;
    }
    phys_write8(mmu, paddr, value);
}

