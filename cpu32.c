#include "cpu32.h"
#include "mmu.h"
#include<string.h>
#include<stdio.h>
void cpu32_init(CPU32 *cpu,struct MMU *mmu){
  memset(cpu->registers,0,sizeof(cpu->registers));
  cpu->pc = 0x00000000;
  cpu->sp = 0xFFFFFFF0;
  cpu->flags = 0;
  cpu->halted = false;
  cpu->cycles = 0;
  cpu -> cr3 = 0;
  cpu->interrupt_pending = false;
  cpu->interrupt_number = 0;
  memset(cpu->interrupt_vector,0,sizeof(cpu->interrupt_vector));
  cpu->mmu = mmu;
}
void cpu32_run(CPU32 *cpu)
{
  while(!cpu->halted)
  {
    cpu32_step(cpu);
  }
}
