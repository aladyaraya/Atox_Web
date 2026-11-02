import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const magic = Buffer.from("ATOXBK01");
export function backupKey(value: string | undefined) {
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new Error("Backup encryption key must be 32 random bytes in hex");
  return Buffer.from(value, "hex");
}
export function encryptBackup(data: Buffer, key: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    magic,
    iv,
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}
export function decryptBackup(data: Buffer, key: Buffer) {
  if (data.length < 36 || !data.subarray(0, 8).equals(magic))
    throw new Error("Invalid encrypted backup");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(8, 20));
  decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    decipher.update(data.subarray(20, -16)),
    decipher.final(),
  ]);
}
