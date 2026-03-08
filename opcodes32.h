#ifndef OPCODES32_H
#define OPCODES32_H
typedef enum{
    OP_NOP  = 0x00,  // Do nothing
     OP_LOAD = 0x01,
     OP_MOV  = 0x02,
     OP_ADD  = 0x03,
     OP_SUB  = 0x04,
     OP_AND  = 0x05,
     OP_OR   = 0x06,
     OP_XOR  = 0x07,
     OP_NOT  = 0x08,
     OP_SHL  = 0x09,
     OP_SHR  = 0x0A,
     OP_CMP  = 0x0B,
     OP_JMP  = 0x0C,
     OP_JZ   = 0x0D,
     OP_JNZ  = 0x0E,
     OP_JN   = 0x0F,
     OP_LDR  = 0x10,
     OP_STR  = 0x11,
     OP_PUSH = 0x12,
     OP_POP  = 0x13,
     OP_CALL = 0x14,
     OP_RET  = 0x15,
     OP_HALT = 0x16,
     OP_MUL = 0x17, //MULTIPLICATION
     OP_DIV = 0x18, //DIVISION
     OP_MOD = 0x19, //MODULUS
     OP_STI = 0x1A, // SET INTERRUPT
     OP_CLI = 0x1B, //CLEAR INTERRUPT
     OP_IRET = 0x1C, //RETURN FROM INTERRUPT
     OP_JGT = 0x1D, //JUMP IF GREATER THAN
     OP_JLT = 0x1E, // JUMP IF LESS THAN
     OP_JGE = 0x1F, // JUMP IF  GREATER THAN OR EQUAL
     OP_JLE = 0x20, // JUMP IF LESS THAN OR EQUAL
     OP_ROL = 0x21, //ROTATE LEFT
     OP_ROR = 0x22, //ROTATE RIGHT
     OP_SWAP = 0x23,//FOR SWAPPING REGISTERS
}Opcode32;
#endif
