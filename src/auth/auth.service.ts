import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';

import { LOCAL_USER_EMAIL } from '../common/local-user';
import { UserRole, UserStatus } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from './jwt-token.service';
import { PasswordService } from './password.service';

export type AuthUserView = {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  role: string;
  status: string;
  createdAt: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtTokenService,
  ) {}

  async register(input: { email: string; password: string; username?: string }) {
    const email = input.email.trim().toLowerCase();
    const username = input.username?.trim() || email.split('@')[0];
    const passwordHash = await this.passwords.hash(input.password);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw new ConflictException('该邮箱已注册');
    }

    const passwordedCount = await this.prisma.user.count({
      where: { passwordHash: { not: null } },
    });

    let user: User;
    if (existing && !existing.passwordHash) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          username,
          passwordHash,
          role: passwordedCount === 0 ? UserRole.admin : existing.role,
          status: UserStatus.active,
        },
      });
    } else {
      const placeholder = await this.prisma.user.findFirst({
        where: { email: LOCAL_USER_EMAIL, passwordHash: null },
        orderBy: { id: 'asc' },
      });

      if (placeholder && passwordedCount === 0) {
        user = await this.prisma.user.update({
          where: { id: placeholder.id },
          data: {
            email,
            username,
            passwordHash,
            role: UserRole.admin,
            status: UserStatus.active,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email,
            username,
            passwordHash,
            role: passwordedCount === 0 ? UserRole.admin : UserRole.user,
            status: UserStatus.active,
          },
        });
      }
    }

    return this.issueSession(user);
  }

  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await this.passwords.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    if (user.status !== UserStatus.active) {
      throw new ForbiddenException('账号不可用');
    }
    return this.issueSession(user);
  }

  async getProfile(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('请先登录');
    }
    return this.toProfile(user);
  }

  toProfile(user: Pick<User, 'id' | 'email' | 'username' | 'avatar' | 'role' | 'status' | 'createdAt'>): AuthUserView {
    return {
      id: String(user.id),
      email: user.email,
      username: user.username || user.email.split('@')[0],
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private issueSession(user: User) {
    return {
      user: this.toProfile(user),
      accessToken: this.jwt.sign(user, 'access'),
      refreshToken: this.jwt.sign(user, 'refresh'),
    };
  }
}
