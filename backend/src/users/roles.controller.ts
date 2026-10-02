import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { UsersService } from './users.service';

@Controller('roles')
@Roles('ADMIN')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): ReturnType<UsersService['listRoles']> {
    return this.users.listRoles();
  }
}
