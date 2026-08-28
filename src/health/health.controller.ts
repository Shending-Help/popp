import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  // Unauthenticated by design: probes must not carry credentials.
  @Get()
  @ApiOperation({ summary: 'Check service health' })
  check() {
    return { status: 'ok' };
  }
}
