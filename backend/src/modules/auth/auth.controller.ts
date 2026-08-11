import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AgentRegisterDto, LoginDto, LogoutDto, RefreshDto } from './auth.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}

  private setRefreshCookie(response: Response, token: string) {
    response.cookie('rainwood_refresh', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: process.env.AUTH_COOKIE_PATH ?? '/api/v1/auth', maxAge: 30 * 86_400_000 });
  }

  @Post('login')
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.s.login(body.email, body.password, { ip: request.ip, ua: request.headers['user-agent'] });
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('agent/register')
  async registerAgent(@Body() body: AgentRegisterDto) {
    return this.s.registerAgent(body.name, body.email, body.password);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const raw = body.refreshToken ?? request.cookies?.rainwood_refresh;
    const result = await this.s.refresh(raw, { ip: request.ip, ua: request.headers['user-agent'] });
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: LogoutDto, @Req() request: Request, @Res({ passthrough: true }) response: Response, @CurrentUser() user: any) {
    await this.s.logout(body.refreshToken ?? request.cookies?.rainwood_refresh, body.allDevices, user.id);
    response.clearCookie('rainwood_refresh', { httpOnly: true, sameSite: 'lax', path: process.env.AUTH_COOKIE_PATH ?? '/api/v1/auth' });
    return { ok: true };
  }
}
