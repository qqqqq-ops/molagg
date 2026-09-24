import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type JwtTokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  typ: JwtTokenType;
  iat: number;
  exp: number;
};

const ACCESS_TTL_SECONDS = 60 * 60 * 24 * 7;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class JwtTokenService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('APP_ENCRYPTION_KEY') ?? '';
    if (!raw) throw new Error('Missing APP_ENCRYPTION_KEY');
    this.secret = createHash('sha256').update(raw).digest();
  }

  sign(user: { id: bigint | number | string; email: string; role: string }, type: JwtTokenType) {
    const now = Math.floor(Date.now() / 1000);
    const ttl = type === 'refresh' ? REFRESH_TTL_SECONDS : ACCESS_TTL_SECONDS;
    const payload: JwtPayload = {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      typ: type,
      iat: now,
      exp: now + ttl,
    };

    const header = this.toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.toBase64Url(JSON.stringify(payload));
    const unsigned = `${header}.${body}`;
    return `${unsigned}.${this.signBytes(unsigned)}`;
  }

  verify(token: string, expectedType: JwtTokenType = 'access'): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('请先登录');

    const [header, body, signature] = parts;
    const unsigned = `${header}.${body}`;
    const expected = this.signBytes(unsigned);
    const actual = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
      throw new UnauthorizedException('请先登录');
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    } catch {
      throw new UnauthorizedException('请先登录');
    }

    if (!payload?.sub || payload.typ !== expectedType) {
      throw new UnauthorizedException('请先登录');
    }
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    return payload;
  }

  readBearer(authorization: string | undefined): string | null {
    if (!authorization) return null;
    const [scheme, token] = authorization.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
    return token.trim() || null;
  }

  private signBytes(unsigned: string) {
    return this.toBase64Url(createHmac('sha256', this.secret).update(unsigned).digest());
  }

  private toBase64Url(value: string | Buffer) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return buffer.toString('base64url');
  }
}
