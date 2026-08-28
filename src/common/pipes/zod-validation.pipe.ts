import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: 'VALIDATION_FAILED',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'), message: i.message,
        })),
      });
    }
    return result.data;
  }
}
