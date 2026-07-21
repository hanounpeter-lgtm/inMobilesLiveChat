import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResetPasswordRequest,
  TokenRequest,
} from '@inmobiles/shared-types';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  private readonly publicSignup: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.publicSignup = config.get<string>('ALLOW_PUBLIC_SIGNUP', 'true') !== 'false';
  }

  @Get('signup-availability')
  signupAvailability() {
    return { enabled: this.publicSignup };
  }

  @Post('register')
  @HttpCode(200)
  async register(
    @Body(new ZodValidationPipe(RegisterRequest)) body: RegisterRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    if (!this.publicSignup) {
      throw new ForbiddenException('Self-signup is disabled — ask an admin for an invite');
    }
    const user = await this.auth.register(body.displayName, body.email, body.password);
    const { accessToken, refreshToken } = await this.auth.issueTokens(
      user.id,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, refreshToken);
    return {
      accessToken,
      user: await this.auth.getAuthUser(user.id),
      verifyUrl: await this.auth.verifyUrlFor(user.id),
    };
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordRequest)) body: ForgotPasswordRequest) {
    return this.auth.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body(new ZodValidationPipe(ResetPasswordRequest)) body: ResetPasswordRequest) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body(new ZodValidationPipe(TokenRequest)) body: TokenRequest) {
    await this.auth.verifyEmail(body.token);
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      // HTTP-only deploys (bare IP, no TLS) must NOT set Secure or the
      // browser drops the refresh cookie. Flip COOKIE_SECURE=true behind HTTPS.
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/api/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const user = await this.auth.validateCredentials(body.email, body.password);
    const { accessToken, refreshToken } = await this.auth.issueTokens(
      user.id,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user: await this.auth.getAuthUser(user.id) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedException('No refresh token');
    const { accessToken, refreshToken } = await this.auth.rotateRefreshToken(presented);
    this.setRefreshCookie(res, refreshToken);
    const payload = await this.auth.verifyAccessToken(accessToken);
    return { accessToken, user: await this.auth.getAuthUser(payload.sub) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) await this.auth.revokeRefreshToken(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }
}
