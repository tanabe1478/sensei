import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/gh/token/crypto.js';

describe('gh token crypto', () => {
  const masterKey = 'test-master-key-for-encryption';

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt a token correctly', () => {
      const plaintext = 'ghp_abcdef1234567890';
      const encrypted = encrypt(plaintext, masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV/salt)', () => {
      const plaintext = 'ghp_same_token';
      const enc1 = encrypt(plaintext, masterKey);
      const enc2 = encrypt(plaintext, masterKey);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.salt).not.toBe(enc2.salt);
    });

    it('should handle empty string', () => {
      const encrypted = encrypt('', masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toBe('');
    });

    it('should handle long tokens', () => {
      const longToken = 'github_pat_' + 'a'.repeat(200);
      const encrypted = encrypt(longToken, masterKey);
      const decrypted = decrypt(encrypted, masterKey);
      expect(decrypted).toBe(longToken);
    });
  });

  describe('wrong key rejection', () => {
    it('should throw when decrypting with wrong key', () => {
      const encrypted = encrypt('ghp_secret', masterKey);
      expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
    });
  });

  describe('tampered data rejection', () => {
    it('should throw when ciphertext is tampered', () => {
      const encrypted = encrypt('ghp_secret', masterKey);
      const tampered = { ...encrypted, ciphertext: 'AAAA' + encrypted.ciphertext.slice(4) };
      expect(() => decrypt(tampered, masterKey)).toThrow();
    });

    it('should throw when tag is tampered', () => {
      const encrypted = encrypt('ghp_secret', masterKey);
      const tampered = { ...encrypted, tag: 'AAAA' + encrypted.tag.slice(4) };
      expect(() => decrypt(tampered, masterKey)).toThrow();
    });
  });

  describe('output format', () => {
    it('should return base64 encoded fields', () => {
      const encrypted = encrypt('ghp_test', masterKey);
      // All fields should be valid base64
      for (const field of ['ciphertext', 'iv', 'tag', 'salt'] as const) {
        expect(() => Buffer.from(encrypted[field], 'base64')).not.toThrow();
        expect(encrypted[field].length).toBeGreaterThan(0);
      }
      // IV should be 12 bytes = 16 base64 chars
      expect(Buffer.from(encrypted.iv, 'base64')).toHaveLength(12);
      // Salt should be 16 bytes
      expect(Buffer.from(encrypted.salt, 'base64')).toHaveLength(16);
      // Tag should be 16 bytes
      expect(Buffer.from(encrypted.tag, 'base64')).toHaveLength(16);
    });
  });
});
