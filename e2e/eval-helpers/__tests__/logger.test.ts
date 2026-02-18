import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { appendLog } from '../logger';
import type { EvalLogEntry } from '../../types';

const TEST_LOG_PATH = join(__dirname, '../../eval-log.test.jsonl');

function makeEntry(overrides: Partial<EvalLogEntry> = {}): EvalLogEntry {
  return {
    timestamp: '2026-02-18T12:00:00.000Z',
    trigger: 'manual',
    changedFiles: [],
    scopeReason: '--all',
    scenarios: [],
    totals: { apiCalls: 0, scenariosRun: 0, passed: 0, warned: 0, failed: 0, durationMs: 100 },
    ...overrides,
  };
}

describe('logger', () => {
  afterEach(() => {
    if (existsSync(TEST_LOG_PATH)) unlinkSync(TEST_LOG_PATH);
  });

  it('creates a new JSONL file if none exists', () => {
    appendLog(makeEntry(), TEST_LOG_PATH);
    expect(existsSync(TEST_LOG_PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(TEST_LOG_PATH, 'utf-8').trim());
    expect(parsed.timestamp).toBe('2026-02-18T12:00:00.000Z');
  });

  it('appends to existing file without overwriting', () => {
    appendLog(makeEntry({ trigger: 'auto' }), TEST_LOG_PATH);
    appendLog(makeEntry({ trigger: 'manual' }), TEST_LOG_PATH);
    const lines = readFileSync(TEST_LOG_PATH, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).trigger).toBe('auto');
    expect(JSON.parse(lines[1]).trigger).toBe('manual');
  });

  it('writes valid JSON per line', () => {
    appendLog(makeEntry({ scopeReason: '--scenario test' }), TEST_LOG_PATH);
    expect(() => JSON.parse(readFileSync(TEST_LOG_PATH, 'utf-8').trim())).not.toThrow();
  });
});
