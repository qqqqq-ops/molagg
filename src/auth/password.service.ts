import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  async verify(password: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored || !stored.includes(':')) return false;

    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;

    const derived = (await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)) as Buffer;
    const expected = Buffer.from(hashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }
}
