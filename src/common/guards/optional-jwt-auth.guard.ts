import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { JwtTokenService } from '../../auth/jwt-token.service';
import { UserStatus } from '../prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.jwt.readBearer(request.headers?.authorization);
    if (!token) return true;

    try {
      const payload = this.jwt.verify(token, 'access');
      const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
      if (user && user.status === UserStatus.active) {
        request.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          username: user.username,
        };
      }
    } catch {
      // optional: ignore invalid tokens
    }

    return true;
  }
}
