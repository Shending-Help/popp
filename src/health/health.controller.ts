import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Unauthenticated by design: probes must not carry credentials.
  @Get()
  check() {
    return { status: 'ok' };
  }
}
