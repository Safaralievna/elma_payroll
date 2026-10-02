import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { UserView } from './user-view';
import {
  CreateUserInput,
  createUserSchema,
  ResetPasswordInput,
  resetPasswordSchema,
  UpdateUserInput,
  updateUserSchema,
} from './users.schemas';
import { UsersService } from './users.service';

const idPipe = new ZodValidationPipe(idParamSchema);

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserView[]> {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id', idPipe) id: bigint): Promise<UserView> {
    return this.users.getById(id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ): Promise<UserView> {
    return this.users.create(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<UserView> {
    return this.users.update(actor, id, body);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', idPipe) id: bigint,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    return this.users.resetPassword(actor, id, body);
  }
}
