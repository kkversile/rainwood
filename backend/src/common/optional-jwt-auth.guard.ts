import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(error: unknown, user: TUser): TUser | undefined {
    if (error) return undefined;
    return user;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
