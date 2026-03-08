#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <ctype.h>
#include "cpu32.h"
#include "opcodes32.h"
#include "instructions32.h"

int parse_register32(const char *str)
{
    while(*str == ' ' || *str == '\t') str++;
    char clean[16];
    strncpy(clean, str, 15);
    clean[15] = '\0';
    char *comma = strchr(clean, ',');
    if(comma) *comma = '\0';
    int len = strlen(clean);
    while(len > 0 && clean[len-1] <= ' ') clean[--len] = '\0';
    if(clean[0] == 'r' || clean[0] == 'R') {
        int reg = atoi(clean + 1);
        if(reg >= 0 && reg <= 15) return reg;
    }
    return -1;
}

int parse_immediate32(const char *str)
{
    while(*str == ' ' || *str == '\t') str++;
    return atoi(str);
}

int assemble32(const char *source, uint32_t *output, int max_words)
{
    char label_names[64][32];
    uint32_t label_addresses[64];
    int label_count = 0;
    uint32_t address = 0;
    int word_count = 0;
    char *src = malloc(strlen(source) + 1);
    strcpy(src, source);
    char *line = strtok(src, "\n");
    while(line) {
        char *t = line;
        while(*t == ' ' || *t == '\t') t++;
        if(*t && *t != ';') {
            char *colon = strchr(t, ':');
            if(colon && colon[1] == '\0') {
                *colon = '\0';
                strncpy(label_names[label_count], t, 31);
                label_names[label_count][31] = '\0';
                label_addresses[label_count] = address;
                label_count++;
            } else {
                char mn[16];
                sscanf(t, "%15s", mn);
                for(int i = 0; mn[i]; i++) mn[i] = toupper(mn[i]);
                address += 4;
            }
        }
        line = strtok(NULL, "\n");
    }
    free(src);
    src = malloc(strlen(source) + 1);
    strcpy(src, source);
    line = strtok(src, "\n");
    while(line && word_count < max_words) {
        char *t = line;
        while(*t == ' ' || *t == '\t') t++;
        if(!*t || *t == ';' || strchr(t, ':')) {
            line = strtok(NULL, "\n");
            continue;
        }
        char mn[16], a1[32] = "", a2[32] = "";
        sscanf(t, "%15s %31[^,],%31s", mn, a1, a2);
        for(int i = 0; mn[i]; i++) mn[i] = toupper(mn[i]);

        if(!strcmp(mn,"NOP"))
            output[word_count++] = ENCODE_REG32(OP_NOP,0,0,0);
        else if(!strcmp(mn,"HALT"))
            output[word_count++] = ENCODE_REG32(OP_HALT,0,0,0);
        else if(!strcmp(mn,"RET"))
            output[word_count++] = ENCODE_REG32(OP_RET,0,0,0);
        else if(!strcmp(mn,"STI"))
            output[word_count++] = ENCODE_REG32(OP_STI,0,0,0);
        else if(!strcmp(mn,"CLI"))
            output[word_count++] = ENCODE_REG32(OP_CLI,0,0,0);
        else if(!strcmp(mn,"IRET"))
            output[word_count++] = ENCODE_REG32(OP_IRET,0,0,0);
        else if(!strcmp(mn,"MOV"))
            output[word_count++] = ENCODE_REG32(OP_MOV,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"ADD"))
            output[word_count++] = ENCODE_REG32(OP_ADD,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"SUB"))
            output[word_count++] = ENCODE_REG32(OP_SUB,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"AND"))
            output[word_count++] = ENCODE_REG32(OP_AND,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"OR"))
            output[word_count++] = ENCODE_REG32(OP_OR,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"XOR"))
            output[word_count++] = ENCODE_REG32(OP_XOR,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"NOT"))
            output[word_count++] = ENCODE_REG32(OP_NOT,parse_register32(a1),0,0);
        else if(!strcmp(mn,"CMP"))
            output[word_count++] = ENCODE_REG32(OP_CMP,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"MUL"))
            output[word_count++] = ENCODE_REG32(OP_MUL,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"DIV"))
            output[word_count++] = ENCODE_REG32(OP_DIV,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"MOD"))
            output[word_count++] = ENCODE_REG32(OP_MOD,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"SHL"))
            output[word_count++] = ENCODE_REG32(OP_SHL,parse_register32(a1),0,parse_immediate32(a2));
        else if(!strcmp(mn,"SHR"))
            output[word_count++] = ENCODE_REG32(OP_SHR,parse_register32(a1),0,parse_immediate32(a2));
        else if(!strcmp(mn,"ROL"))
            output[word_count++] = ENCODE_REG32(OP_ROL,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"ROR"))
            output[word_count++] = ENCODE_REG32(OP_ROR,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"SWAP"))
            output[word_count++] = ENCODE_REG32(OP_SWAP,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"LDR"))
            output[word_count++] = ENCODE_REG32(OP_LDR,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"STR"))
            output[word_count++] = ENCODE_REG32(OP_STR,parse_register32(a1),parse_register32(a2),0);
        else if(!strcmp(mn,"LOAD"))
            output[word_count++] = ENCODE_REG32(OP_LOAD,parse_register32(a1),0,parse_immediate32(a2));
        else if(!strcmp(mn,"PUSH"))
            output[word_count++] = ENCODE_REG32(OP_PUSH,0,parse_register32(a1),0);
        else if(!strcmp(mn,"POP"))
            output[word_count++] = ENCODE_REG32(OP_POP,parse_register32(a1),0,0);
        else if(!strcmp(mn,"CALL")) {
            uint32_t target = 0;
            for(int i = 0; i < label_count; i++) {
                if(!strcmp(a1, label_names[i])) {
                    target = label_addresses[i];
                    break;
                }
            }
            output[word_count++] = ENCODE_JUMP32(OP_CALL, target);
        }
        else if(!strcmp(mn,"JMP") || !strcmp(mn,"JZ")  || !strcmp(mn,"JNZ") ||
                !strcmp(mn,"JN")  || !strcmp(mn,"JGT") || !strcmp(mn,"JLT") ||
                !strcmp(mn,"JGE") || !strcmp(mn,"JLE")) {
            Opcode32 jump = !strcmp(mn,"JMP") ? OP_JMP :
                            !strcmp(mn,"JZ")  ? OP_JZ  :
                            !strcmp(mn,"JNZ") ? OP_JNZ :
                            !strcmp(mn,"JN")  ? OP_JN  :
                            !strcmp(mn,"JGT") ? OP_JGT :
                            !strcmp(mn,"JLT") ? OP_JLT :
                            !strcmp(mn,"JGE") ? OP_JGE : OP_JLE;
            uint32_t target = 0;
            int found = 0;
            for(int i = 0; i < label_count; i++) {
                if(!strcmp(a1, label_names[i])) {
                    target = label_addresses[i];
                    found = 1;
                    break;
                }
            }
            if(!found && a1[0]) target = atoi(a1);
            output[word_count++] = ENCODE_JUMP32(jump, target);
        }
        else {
            fprintf(stderr, "Unknown instruction: %s\n", mn);
        }
        line = strtok(NULL, "\n");
    }
    free(src);
    return word_count;
}
