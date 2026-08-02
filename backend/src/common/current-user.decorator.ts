import { createParamDecorator,ExecutionContext } from '@nestjs/common'; export const CurrentUser=createParamDecorator((_d,c:ExecutionContext)=>c.switchToHttp().getRequest().user);
