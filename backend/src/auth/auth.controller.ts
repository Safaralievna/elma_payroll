import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UserView } from '../users/user-view';
import { UsersService } from '../users/users.service';
import { ChangePasswordInput, changePasswordSchema, LoginInput, loginSchema } from './auth.schemas';
import { LoginResult, AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { CurrentUser, Public } from './decorators';
import { LoginThrottlerGuard } from './login-throttler.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<LoginResult> {
    return this.auth.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserView> {
    return this.users.getById(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    return this.auth.changePassword(user, body);
  }
}
