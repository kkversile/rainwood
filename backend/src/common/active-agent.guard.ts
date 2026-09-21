import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { agentAccessMessage, isAgentPendingOnboarding } from './agent-access';

@Injectable()
export class ActiveAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user;
    if (user?.role !== 'AGENT' || user.active === true) return true;
    if (isAgentPendingOnboarding(user)) throw new ForbiddenException(agentAccessMessage(user));
    throw new ForbiddenException(agentAccessMessage(user));
  }
}
