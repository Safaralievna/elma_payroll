import {
  Controller,
  Get,
  HttpStatus,
  Param,
  PipeTransform,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { AppError } from '../common/app-error';
import { Page, paginationShape } from '../common/schemas';
import { idParamSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { IMPORT_TYPES, ImportPath } from './import-kind';
import { IMPORT_MAX_FILE_BYTES } from './import.constants';
import { BatchView, ImportErrorView, ImportResult, ImportsService, UploadedFile as ImportFile } from './imports.service';

const IMPORT_PATHS = Object.keys(IMPORT_TYPES) as [ImportPath, ...ImportPath[]];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** URL'dagi import turi; noma'lum tur — 404 (bunday endpoint yo'q). */
class ImportPathPipe implements PipeTransform<string, ImportPath> {
  transform(value: string): ImportPath {
    if (!(IMPORT_PATHS as string[]).includes(value)) {
      throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Bunday import turi yo'q: ${value}`);
    }
    return value as ImportPath;
  }
}

const listSchema = z.strictObject({ type: z.enum(IMPORT_PATHS).optional(), ...paginationShape });
const pageSchema = z.strictObject(paginationShape);
const idPipe = new ZodValidationPipe(idParamSchema);

@Controller('imports')
@Roles('ADMIN', 'CALCULATOR', 'APPROVER')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.output<typeof listSchema>): Promise<Page<BatchView>> {
    return this.imports.list(query);
  }

  @Get('templates/:type')
  async template(@Param('type', ImportPathPipe) type: ImportPath): Promise<StreamableFile> {
    return new StreamableFile(await this.imports.template(type), {
      type: XLSX_TYPE,
      disposition: `attachment; filename="${type}-shablon.xlsx"`,
    });
  }

  @Get(':id')
  get(@Param('id', idPipe) id: bigint): Promise<BatchView> {
    return this.imports.get(id);
  }

  @Get(':id/errors')
  errors(
    @Param('id', idPipe) id: bigint,
    @Query(new ZodValidationPipe(pageSchema)) query: z.output<typeof pageSchema>,
  ): Promise<Page<ImportErrorView>> {
    return this.imports.errors(id, query.page, query.pageSize);
  }

  /** multipart/form-data, maydon nomi "file", bitta .xlsx. */
  @Post(':type')
  @Roles('CALCULATOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1 } }))
  upload(
    @CurrentUser() actor: AuthUser,
    @Param('type', ImportPathPipe) type: ImportPath,
    @UploadedFile() file: ImportFile | undefined,
  ): Promise<ImportResult> {
    return this.imports.upload(actor, type, file);
  }
}
