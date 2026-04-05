/**
 * 경량 구조화 로거.
 * MCP 서버는 stdout을 프로토콜에 사용하므로 모든 로그는 stderr로 출력합니다.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = 'warn';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

// formatMessage 함수는 내부 로직을 처리합니다.
function formatMessage(level: LogLevel, module: string, message: string, detail?: string): string {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const tag = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
  return detail ? `${tag} ${message} — ${detail}` : `${tag} ${message}`;
}

export const Logger = {
  setLevel(level: LogLevel) { currentLevel = level; },
  getLevel(): LogLevel { return currentLevel; },

  debug(module: string, message: string, detail?: string) {
    if (shouldLog('debug')) console.error(formatMessage('debug', module, message, detail));
  },
  info(module: string, message: string, detail?: string) {
    if (shouldLog('info')) console.error(formatMessage('info', module, message, detail));
  },
  warn(module: string, message: string, detail?: string) {
    if (shouldLog('warn')) console.error(formatMessage('warn', module, message, detail));
  },
  error(module: string, message: string, detail?: string) {
    if (shouldLog('error')) console.error(formatMessage('error', module, message, detail));
  },
};
