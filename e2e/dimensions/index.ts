import type { DimensionDefinition } from '../types';
import { outputLength } from './output-length';
import { instructionFollowing } from './instruction-following';
import { voice } from './voice';
import { structuredOutput } from './structured-output';

const dimensions = new Map<string, DimensionDefinition>([
  [outputLength.name, outputLength],
  [instructionFollowing.name, instructionFollowing],
  [voice.name, voice],
  [structuredOutput.name, structuredOutput],
]);

export function getDimension(name: string): DimensionDefinition | undefined { return dimensions.get(name); }
export function getAllDimensions(): Map<string, DimensionDefinition> { return dimensions; }
export function registerDimension(dim: DimensionDefinition): void { dimensions.set(dim.name, dim); }
