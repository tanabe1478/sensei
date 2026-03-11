import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_ALLOWED_USER = 'user-123';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('必須環境変数が設定されていれば Config を返す', () => {
    const config = loadConfig();
    expect(config.discord.token).toBe('test-token');
    expect(config.discord.allowedUser).toBe('user-123');
  });

  it('DISCORD_TOKEN がないとエラー', () => {
    delete process.env.DISCORD_TOKEN;
    expect(() => loadConfig()).toThrow('DISCORD_TOKEN');
  });

  it('DISCORD_ALLOWED_USER がないとエラー', () => {
    delete process.env.DISCORD_ALLOWED_USER;
    expect(() => loadConfig()).toThrow('DISCORD_ALLOWED_USER');
  });

  it('AUTO_REPLY_CHANNELS をカンマ区切りでパースする', () => {
    process.env.AUTO_REPLY_CHANNELS = 'ch1, ch2, ch3';
    const config = loadConfig();
    expect(config.discord.autoReplyChannels).toEqual(['ch1', 'ch2', 'ch3']);
  });

  it('AUTO_REPLY_CHANNELS 未設定なら空配列', () => {
    const config = loadConfig();
    expect(config.discord.autoReplyChannels).toEqual([]);
  });

  it('TIMEOUT_MS をパースする', () => {
    process.env.TIMEOUT_MS = '60000';
    const config = loadConfig();
    expect(config.agent.timeoutMs).toBe(60000);
  });

  it('デフォルトタイムアウトは 5分', () => {
    const config = loadConfig();
    expect(config.agent.timeoutMs).toBe(5 * 60 * 1000);
  });

  it('SCHEDULER_ENABLED=false で無効化', () => {
    process.env.SCHEDULER_ENABLED = 'false';
    const config = loadConfig();
    expect(config.scheduler.enabled).toBe(false);
  });

  it('SCHEDULER_ENABLED 未設定はデフォルト有効', () => {
    const config = loadConfig();
    expect(config.scheduler.enabled).toBe(true);
  });

  it('AGENT_MODEL を設定できる', () => {
    process.env.AGENT_MODEL = 'claude-sonnet-4-5-20250514';
    const config = loadConfig();
    expect(config.agent.model).toBe('claude-sonnet-4-5-20250514');
  });
});
