#include <stdint.h>
#include "mmu.h"
#include "cpu32.h"
uint32_t mem_read32(CPU32 *cpu,uint32_t address)
{
  return mmu_read32(cpu->mmu,address);
}
void mem_write32(CPU32 *cpu,uint32_t address,uint32_t value)
{
  mmu_write32(cpu->mmu,address,value);
}
uint8_t mem_read8(CPU32 *cpu,uint32_t address)
{
  return mmu_read8(cpu->mmu,address);
}
void mem_write8(CPU32 * cpu,uint32_t address,uint8_t value)
{
  mmu_write8(cpu->mmu,address,value);
}
