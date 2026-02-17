import type { AssumptionType, AssumptionStatus, Assumption } from '@/types';
import { ASSUMPTION_TYPES } from '@/types';

/**
 * Converts raw assumption data from the DB into a status map for card display.
 * Returns null if no assumptions exist (renders "Awaiting validation" fallback).
 */
export function buildAssumptionStatuses(
  raw: Partial<Record<AssumptionType, Assumption>>
): Record<AssumptionType, AssumptionStatus> | null {
  if (Object.keys(raw).length === 0) return null;

  const result = {} as Record<AssumptionType, AssumptionStatus>;
  for (const type of ASSUMPTION_TYPES) {
    result[type] = raw[type]?.status ?? 'untested';
  }
  return result;
}
