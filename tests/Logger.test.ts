import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../src/utils/Logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Logger.setLevel('warn'); // reset to default before each test
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    Logger.setLevel('warn'); // restore default after each test
  });

  it('default level is warn', () => {
    expect(Logger.getLevel()).toBe('warn');
  });

  it('setLevel and getLevel work correctly', () => {
    Logger.setLevel('debug');
    expect(Logger.getLevel()).toBe('debug');

    Logger.setLevel('info');
    expect(Logger.getLevel()).toBe('info');

    Logger.setLevel('error');
    expect(Logger.getLevel()).toBe('error');
  });

  it('warn messages are output at default warn level', () => {
    Logger.warn('TestModule', '경고 메시지');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('error messages are output at default warn level', () => {
    Logger.error('TestModule', '오류 메시지', '세부 내용');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('debug messages are suppressed at warn level', () => {
    Logger.debug('TestModule', '디버그 메시지');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('info messages are suppressed at warn level', () => {
    Logger.info('TestModule', '정보 메시지');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('debug messages are output when level is debug', () => {
    Logger.setLevel('debug');
    Logger.debug('TestModule', '디버그 메시지');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('all levels output when level is debug', () => {
    Logger.setLevel('debug');
    Logger.debug('M', 'debug');
    Logger.info('M', 'info');
    Logger.warn('M', 'warn');
    Logger.error('M', 'error');
    expect(consoleSpy).toHaveBeenCalledTimes(4);
  });

  it('only error outputs when level is error', () => {
    Logger.setLevel('error');
    Logger.debug('M', 'debug');
    Logger.info('M', 'info');
    Logger.warn('M', 'warn');
    Logger.error('M', 'error');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('format includes timestamp, level tag, and module', () => {
    Logger.warn('MyModule', '테스트 메시지');
    const output = consoleSpy.mock.calls[0][0] as string;
    // Timestamp format: HH:mm:ss.SSS
    expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    expect(output).toContain('[WARN]');
    expect(output).toContain('[MyModule]');
    expect(output).toContain('테스트 메시지');
  });

  it('format includes detail after em dash when detail is provided', () => {
    Logger.error('SomeModule', '주 메시지', '세부 오류 정보');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('주 메시지');
    expect(output).toContain('—');
    expect(output).toContain('세부 오류 정보');
  });

  it('format omits em dash when no detail is provided', () => {
    Logger.warn('SomeModule', '주 메시지만');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('—');
    expect(output).toContain('주 메시지만');
  });

  it('error level tag is ERROR in uppercase', () => {
    Logger.error('M', 'msg');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[ERROR]');
  });

  it('debug level tag is DEBUG in uppercase', () => {
    Logger.setLevel('debug');
    Logger.debug('M', 'msg');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[DEBUG]');
  });
});
