import { readFileSync } from 'fs';
import { join } from 'path';

const promptCache = new Map<string, string>();
const PROMPTS_PATH = join(process.cwd(), 'src/lib/advisors/prompts');

export function getAdvisorSystemPrompt(advisorId: string): string {
  if (promptCache.has(advisorId)) {
    return promptCache.get(advisorId)!;
  }

  const filePath = join(PROMPTS_PATH, `${advisorId}.md`);
  try {
    const content = readFileSync(filePath, 'utf-8');
    promptCache.set(advisorId, content);
    return content;
  } catch {
    throw new Error(`Unknown advisor: ${advisorId}`);
  }
}

export function clearAdvisorCache(): void {
  promptCache.clear();
}
