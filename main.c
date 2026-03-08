#include <stdio.h>
#include <stdint.h>
#include "cpu32.h"
#include "interface.h"
#include "mmu.h"
#include<time.h>
#include<inttypes.h>
#include "assembler32.h"
int main()
{
  CPU32 cpu;
  MMU *mmu = mmu_create();
  if(mmu == NULL)
  {
    printf("MMU creation failed.\n");
    return 1;
  }
  cpu32_init(&cpu,mmu);
  const char *program =
      "LOAD R0, 10\n"
      "LOAD R1, 20\n"
      "ADD R0, R1\n"
      "HALT\n";
  uint32_t buffer[4096];
  int words = assemble32(program,buffer,32768);
  for(int i = 0; i < words; i++) {
      mem_write32(&cpu, i * 4, buffer[i]);
  }
  clock_t start = clock();
  cpu32_run(&cpu);
  clock_t end = clock();
  double time_take = ((double)(end - start))/CLOCKS_PER_SEC * 1000000;
  for(int i = 0; i < 16; i++) {
      printf("R%d = %d\n", i, cpu.registers[i]);
  }
  printf("Cycles = %" PRIu64 "\n", cpu.cycles);
  printf("Time taken = %f\n",time_take);
  mmu_print_stats(mmu);
  mmu_destroy(mmu);
  return 0;
}
