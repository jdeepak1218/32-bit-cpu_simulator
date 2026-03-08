#include"cpu32.h"
#include "opcodes32.h"
#include <stdio.h>
#include<stdint.h>
void update_flags32(CPU32 *cpu,uint32_t result,uint32_t a,uint32_t b,Opcode32 op)
{
  cpu->flags = 0;
  if(result == 0)(cpu->flags |= FLAG_ZERO);
  if(result & 0x80000000)(cpu->flags |= FLAG_NEGATIVE);
  int a_neg = (a & 0x80000000);
  int b_neg = (b & 0x80000000);
  int res_neg = (result & 0x80000000);
  if(op == OP_ADD)
  {
    if(!a_neg && !b_neg && res_neg)
    {
      cpu->flags |= FLAG_OVERFLOW;
    }
    else if(a_neg && b_neg && !res_neg)
    {
      cpu->flags |= FLAG_OVERFLOW;
    }
  }
  else if(op == OP_CMP || op == OP_SUB)
  {
    if(!a_neg && b_neg && res_neg)
    {
    cpu->flags |= FLAG_OVERFLOW;
    }
    else if(a_neg && !b_neg && !res_neg)
    {
      cpu->flags |= FLAG_OVERFLOW;
    }
  }
}
uint32_t alu32_execute(CPU32 *cpu,Opcode32 op,uint32_t a,uint32_t b)
{
  uint32_t result = 0;
  switch (op) {
    case OP_ADD : result = a + b; break;
    case OP_AND : result = a&b; break;
    case OP_OR : result = a|b; break;
    case OP_XOR : result = a^b; break;
    case OP_SHR : result = a >> (b & 0x1F); break;
    case OP_SHL : result = a << (b & 0x1F); break;
    case OP_NOT: result = ~a; break;
    case OP_SUB :
    case OP_CMP : result = a - b; break;
    case OP_MUL : result = a * b; break;
    case OP_ROL :
    result = (a << (b & 0x1F)) | (a >> (32 - (b & 0x1F)));
    break;
    case OP_ROR :
    result = (a >> (b & 0x1F)) | (a << (32 - (b & 0x1F)));
    break;
    case OP_DIV :
    if(b == 0)
    {
      fprintf(stderr,"Division by zero \n");
      cpu32_raise_interrupt(cpu,1);
      return 0;
    }
    result = a / b;
    break;
    case OP_MOD :
    if(b == 0)
    {
      fprintf(stderr,"Modulo by zero \n");
      cpu32_raise_interrupt(cpu,1);
      return 0;
    }
    result = a % b;
    break;
    default:
    fprintf(stderr,"Calculator error: unknown operation 0x%X\n",op);
    return 0;
  }
  update_flags32(cpu,result,a,b,op);
  return result;
}
