import type { FoundationDocType } from '@/types';

export interface FrameworkEntry {
  id: string;
  displayName: string;
  advisors: string[]; // advisor IDs that can use this framework
  description: string;
  contextDocs?: FoundationDocType[]; // which foundation docs this framework needs
  enabled?: boolean; // defaults to true if omitted
}

export interface FrameworkExample {
  phase: string;
  context: string;
  user: string;
  advisor: string;
  note: string;
}

export interface FrameworkAntiExample {
  failureMode: string;
  user: string;
  wrong: string;
  right: string;
  why: string;
}
