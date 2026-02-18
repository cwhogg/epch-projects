import { appendFileSync } from 'fs';
import { join } from 'path';
import type { EvalLogEntry } from '../types';

const DEFAULT_LOG_PATH = join(process.cwd(), 'e2e', 'eval-log.jsonl');

export function appendLog(entry: EvalLogEntry, logPath: string = DEFAULT_LOG_PATH): void {
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}
