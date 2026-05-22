import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_LENGTH = 26;
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeBase32(value: bigint, length: number): string {
  let remaining = value;
  let encoded = "";

  for (let index = 0; index < length; index += 1) {
    const mod = Number(remaining % 32n);
    encoded = CROCKFORD_BASE32[mod] + encoded;
    remaining /= 32n;
  }

  return encoded;
}

export function generateUlid(timestamp = Date.now()): string {
  const timeValue = BigInt(timestamp);
  const random = randomBytes(10);
  let randomValue = 0n;

  for (const byte of random) {
    randomValue = (randomValue << 8n) | BigInt(byte);
  }

  const encodedTime = encodeBase32(timeValue, 10);
  const encodedRandom = encodeBase32(randomValue, 16);
  return `${encodedTime}${encodedRandom}`.slice(0, ULID_LENGTH);
}

export function isUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}
