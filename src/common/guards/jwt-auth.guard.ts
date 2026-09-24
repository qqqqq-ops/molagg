import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtTokenService } from '../../auth/jwt-token.service';
import { UserStatus } from '../prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.jwt.readBearer(request.headers?.authorization);
    if (!token) throw new UnauthorizedException('请先登录');

    const payload = this.jwt.verify(token, 'access');
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('请先登录');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      username: user.username,
    };
    return true;
  }
}
