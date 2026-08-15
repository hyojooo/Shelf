import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const logsDir = () => path.join(app.getPath('userData'), 'logs');
let inited = false;

async function ensure(): Promise<void> {
  if (inited) return;
  try {
    await fs.mkdir(logsDir(), { recursive: true });
  } catch {}
  inited = true;
}

function logFileForToday(): string {
  return path.join(
    logsDir(),
    `app-${new Date().toISOString().slice(0, 10)}.log`,
  );
}

export async function logError(err: unknown, context?: string): Promise<void> {
  await ensure();
  const ts = new Date().toISOString();
  const msg = `[${ts}]${context ? ' [' + context + ']' : ''} ${
    err instanceof Error ? err.stack || err.message : String(err)
  }\n`;
  try {
    await fs.appendFile(logFileForToday(), msg);
  } catch {
    /* ignore */
  }
  console.error(msg);
}

export function logInfo(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** 安装全局崩溃处理器，异常时自动记录日志 */
export function installCrashHandlers(): void {
  process.on('uncaughtException', (e) => {
    void logError(e, 'uncaughtException');
  });
  process.on('unhandledRejection', (e) => {
    void logError(e, 'unhandledRejection');
  });
}
