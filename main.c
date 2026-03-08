#include <stdio.h>
#include <stdint.h>
#include "cpu32.h"
#include "interface.h"
#include "mmu.h"
#include <time.h>
#include <inttypes.h>
#include "assembler32.h"

int main()
{
    CPU32 cpu;
    MMU *mmu = mmu_create();
    if(mmu == NULL) {
        printf("MMU creation failed.\n");
        return 1;
    }
    cpu32_init(&cpu, mmu);
    uint32_t pd_frame = mmu_alloc_frame(mmu);
    // printf("pd_frame = 0x%X\n", pd_frame);
    mmu_set_cr3(mmu, pd_frame);
    // map ALL pages first
    mmu_map_page(mmu, 0x00000, 0x00000, PTE_PRESENT | PTE_WRITABLE);  // program
    mmu_map_page(mmu, 0x05000, 0x05000, PTE_PRESENT | PTE_WRITABLE);  // handler
    mmu_map_page(mmu, 0x06000, 0x06000, PTE_PRESENT | PTE_WRITABLE);  // default handler
    mmu_map_page(mmu, 0x3FF000, 0x3FF000, PTE_PRESENT | PTE_WRITABLE); // stack
    const char *handler_program = "NOP\nIRET\n";
    uint32_t handler_buffer[64];
    int handler_words = assemble32(handler_program, handler_buffer, 64);
    for(int i = 0; i < handler_words; i++) {
        mem_write32(&cpu, 0x5000 + i * 4, handler_buffer[i]);
    }
    const char *default_handler = "IRET\n";
    uint32_t default_buffer[64];
    int default_words = assemble32(default_handler, default_buffer, 64);
    for(int i = 0; i < default_words; i++) {
        mem_write32(&cpu, 0x6000 + i * 4, default_buffer[i]);
    }
    for(int i = 0; i < 256; i++) {
        cpu.interrupt_vector[i] = 0x6000;
    }
    cpu.interrupt_vector[0]  = 0x5000;  // divide by zero
    cpu.interrupt_vector[1]  = 0x5000;  // divide by zero
    cpu.interrupt_vector[4]  = 0x5000;  // overflow
    cpu.interrupt_vector[6]  = 0x5000;  // invalid opcode
    cpu.interrupt_vector[14] = 0x5000;  // page fault
    // main test program
    const char *program =
        "STI\n"
        "LOAD R0, 1\n"       // result = 1
        "LOAD R1, 5\n"       // counter = 5
        "LOAD R2, 1\n"       // constant 1
        "loop:\n"
        "MUL R0, R1\n"       // result *= counter
        "SUB R1, R2\n"       // counter--
        "CMP R1, R2\n"       // compare counter with 1
        "JGE loop\n"         // if counter >= 1 loop
        "LOAD R3, 0\n"       // trigger div by zero interrupt
        "DIV R2, R3\n"       // interrupt fires, handled, continues
        "HALT\n";

    uint32_t buffer[4096];
    int words = assemble32(program, buffer, 4096);
    for(int i = 0; i < words; i++) {
        mem_write32(&cpu, i * 4, buffer[i]);
    }
    mmu_enable_paging(mmu, 1);
    clock_t start = clock();
    cpu32_run(&cpu);
    clock_t end = clock();

    double time_take = ((double)(end - start)) / CLOCKS_PER_SEC * 1000000;

    for(int i = 0; i < 16; i++) {
        printf("R%d = %d\n", i, cpu.registers[i]);
    }
    printf("Cycles     = %" PRIu64 "\n", cpu.cycles);
    printf("Time taken = %f microseconds\n", time_take);
    mmu_print_stats(mmu);
    mmu_destroy(mmu);
    return 0;
}
