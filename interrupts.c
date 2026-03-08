#include<stdio.h>
#include "cpu32.h"
void cpu32_raise_interrupt(CPU32 *cpu, uint8_t num)
{
  if(cpu->flags & FLAG_INTERRUPT)
  {
    cpu->interrupt_pending = true;
    cpu->interrupt_number = num;
  }
}
void cpu32_page_fault(CPU32 *cpu, uint32_t vaddr)
{
  printf("PAGE FAULT at virtual address: 0x%08X\n", vaddr);
  cpu32_raise_interrupt(cpu,14);
}
