#ifndef ASSEMBLER32_H
#define ASSEMBLER32_H
#include <stdint.h>
int assemble32(const char *source, uint32_t *output, int max_words);
#endif
