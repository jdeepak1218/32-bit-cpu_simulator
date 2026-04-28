import { describe, it, expect } from 'vitest';
import { MMU } from '../lib/cpu32';
import { PAGE_SIZE, TLB_ENTRIES, PTE_WRITABLE, PTE_USER } from '../types/cpu';

describe('MMU address translation and TLB behavior', () => {
  it('translates a mapped virtual address to physical and populates TLB', () => {
    const mmu = new MMU();
    const pd = mmu.allocFrame();
    mmu.setCR3(pd);
    mmu.enablePaging(true);

    const vaddr = 0x1000;
    const pframe = mmu.allocFrame();
    expect(pframe).not.toBe(0);

    const ok = mmu.mapPage(vaddr, pframe, PTE_WRITABLE | PTE_USER);
    expect(ok).toBe(true);

    // First translation should be TLB miss and insert
    const res1 = mmu.translate(vaddr, false, false);
    expect(res1.pageFault).toBe(false);
    expect(res1.tlbHit).toBe(false);
    expect(res1.paddr).toBe(pframe | (vaddr & (PAGE_SIZE - 1)));

    // Second translation should hit the TLB
    const res2 = mmu.translate(vaddr, false, false);
    expect(res2.pageFault).toBe(false);
    expect(res2.tlbHit).toBe(true);
    expect(res2.paddr).toBe(pframe | (vaddr & (PAGE_SIZE - 1)));
  });

  it('evicts TLB entries in FIFO order when capacity exceeded', () => {
    const mmu = new MMU();
    const pd = mmu.allocFrame();
    mmu.setCR3(pd);
    mmu.enablePaging(true);

    // Map TLB_ENTRIES + 2 pages
    const pages = TLB_ENTRIES + 2;
    const vpns: number[] = [];
    for (let i = 0; i < pages; i++) {
      const v = 0x2000 + i * PAGE_SIZE;
      const pf = mmu.allocFrame();
      mmu.mapPage(v, pf, PTE_WRITABLE | PTE_USER);
      // Access to populate TLB
      mmu.translate(v, false, false);
      vpns.push(v >>> 12);
    }

    const state = mmu.getState();
    // Ensure TLB entries count does not exceed capacity
    const valid = state.tlb.filter((e) => e.valid);
    expect(valid.length).toBeLessThanOrEqual(TLB_ENTRIES);

    // The first vpn should have been evicted (FIFO), check it's not present
    const firstVpn = vpns[0];
    const found = state.tlb.some((e) => e.valid && e.vpn === firstVpn);
    expect(found).toBe(false);
  });
});
