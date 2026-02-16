import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import type { FrameworkExample, FrameworkAntiExample } from './types';
import { getFrameworkEntry } from './registry';

const promptCache = new Map<string, string>();

const PROMPTS_PATH = join(process.cwd(), 'src/lib/frameworks/prompts');

function isFrameworkFolder(frameworkId: string): boolean {
  const folderPath = join(PROMPTS_PATH, frameworkId);
  return existsSync(folderPath) && statSync(folderPath).isDirectory();
}

function stripFrontMatter(content: string): string {
  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      return content.slice(endIndex + 3).trim();
    }
  }
  return content;
}

function parseExamplesByPhase(
  content: string
): Map<string, FrameworkExample[]> {
  const examples = new Map<string, FrameworkExample[]>();
  const phaseSections = content
    .split(/(?=^## phase \d+:)/im)
    .filter((s) => s.trim());

  for (const section of phaseSections) {
    const phaseMatch = section.match(/^## (phase \d+:[^\n]+)/i);
    if (!phaseMatch) continue;

    const phase = phaseMatch[1].trim();
    const phaseExamples: FrameworkExample[] = [];
    const exampleBlocks = section
      .split(/(?=^### )/m)
      .filter((s) => s.startsWith('### '));

    for (const block of exampleBlocks) {
      const contextMatch = block.match(/^### ([^\n]+)/);
      const userMatch = block.match(/\*\*User:\*\*\s*"([^"]+)"/);
      const advisorMatch = block.match(/\*\*Advisor:\*\*\s*"([^"]+)"/);
      const noteMatch = block.match(/^>\s*(.+)$/m);

      if (contextMatch && userMatch && advisorMatch) {
        phaseExamples.push({
          phase,
          context: contextMatch[1].trim(),
          user: userMatch[1].trim(),
          advisor: advisorMatch[1].trim(),
          note: noteMatch?.[1]?.trim() || '',
        });
      }
    }

    if (phaseExamples.length > 0) {
      examples.set(phase, phaseExamples);
    }
  }

  return examples;
}

function parseAntiExamples(content: string): FrameworkAntiExample[] {
  const antiExamples: FrameworkAntiExample[] = [];
  const blocks = content
    .split(/(?=^### )/m)
    .filter((s) => s.startsWith('### '));

  for (const block of blocks) {
    const modeMatch = block.match(/^### ([^\n]+)/);
    const userMatch = block.match(/\*\*User:\*\*\s*"([^"]+)"/);
    const wrongMatch = block.match(/\*\*Wrong:\*\*\s*"([^"]+)"/);
    const rightMatch = block.match(/\*\*Right:\*\*\s*"([^"]+)"/);
    const whyMatch = block.match(/^>\s*(.+)$/m);

    if (modeMatch && userMatch && wrongMatch && rightMatch) {
      antiExamples.push({
        failureMode: modeMatch[1].trim(),
        user: userMatch[1].trim(),
        wrong: wrongMatch[1].trim(),
        right: rightMatch[1].trim(),
        why: whyMatch?.[1]?.trim() || '',
      });
    }
  }

  return antiExamples;
}

function formatExample(ex: FrameworkExample): string {
  const note = ex.note ? `\n  _${ex.note}_` : '';
  return `**Example (${ex.context}):**\n- User: "${ex.user}"\n- Advisor: "${ex.advisor}"${note}`;
}

function formatAntiExample(ae: FrameworkAntiExample): string {
  const why = ae.why ? `\n  _${ae.why}_` : '';
  return `### ${ae.failureMode}\n- User: "${ae.user}"\n- Wrong: "${ae.wrong}"\n- Right: "${ae.right}"${why}`;
}

function injectExamplesAfterPhase(
  prompt: string,
  phaseNumber: string,
  examples: FrameworkExample[]
): string {
  const examplesMarkdown = examples.map(formatExample).join('\n\n');
  const waitPattern = new RegExp(
    `(##+ phase ${phaseNumber}:[^]*?\\*?\\*?WAIT[^\\n]*(?:respond|response|continuing)[^\\n]*\\*?\\*?)`,
    'gi'
  );
  return prompt.replace(
    waitPattern,
    (match) => `${match}\n\n#### Examples:\n${examplesMarkdown}`
  );
}

function injectAntiExamples(
  prompt: string,
  antiExamples: FrameworkAntiExample[]
): string {
  const antiExamplesMarkdown = antiExamples.map(formatAntiExample).join('\n\n');
  const section = `\n## Anti-Examples (Avoid These Patterns)\n\n${antiExamplesMarkdown}`;

  if (prompt.includes('\n## Key Rules')) {
    return prompt.replace('\n## Key Rules', `${section}\n\n## Key Rules`);
  }
  return prompt + section;
}

function assemblePromptWithExamples(
  prompt: string,
  examples: Map<string, FrameworkExample[]>,
  antiExamples: FrameworkAntiExample[]
): string {
  const hasPhases = /##+ phase \d+:/i.test(prompt);
  if (!hasPhases) {
    return prompt;
  }

  let assembled = prompt;

  for (const [phase, phaseExamples] of examples) {
    const phaseNumber = phase.match(/phase (\d+)/i)?.[1];
    if (phaseNumber) {
      assembled = injectExamplesAfterPhase(assembled, phaseNumber, phaseExamples);
    }
  }

  if (antiExamples.length > 0) {
    assembled = injectAntiExamples(assembled, antiExamples);
  }

  return assembled;
}

export function getFrameworkPrompt(frameworkId: string): string | null {
  if (promptCache.has(frameworkId)) {
    return promptCache.get(frameworkId)!;
  }

  if (!getFrameworkEntry(frameworkId)) {
    console.error(
      `[framework-loader] Unknown framework ID (not in registry): ${frameworkId}`
    );
    return null;
  }

  try {
    let content: string;

    if (isFrameworkFolder(frameworkId)) {
      const folderPath = join(PROMPTS_PATH, frameworkId);
      const promptPath = join(folderPath, 'prompt.md');
      const examplesPath = join(folderPath, 'examples.md');
      const antiExamplesPath = join(folderPath, 'anti-examples.md');

      const rawPrompt = readFileSync(promptPath, 'utf-8');
      const prompt = stripFrontMatter(rawPrompt);

      let examples = new Map<string, FrameworkExample[]>();
      let antiExamples: FrameworkAntiExample[] = [];

      if (existsSync(examplesPath)) {
        examples = parseExamplesByPhase(readFileSync(examplesPath, 'utf-8'));
      }

      if (existsSync(antiExamplesPath)) {
        antiExamples = parseAntiExamples(
          readFileSync(antiExamplesPath, 'utf-8')
        );
      }

      content = assemblePromptWithExamples(prompt, examples, antiExamples);
    } else {
      const promptPath = join(PROMPTS_PATH, `${frameworkId}.md`);
      const rawContent = readFileSync(promptPath, 'utf-8');
      content = stripFrontMatter(rawContent);
    }

    promptCache.set(frameworkId, content);
    return content;
  } catch (error) {
    console.error(
      `[framework-loader] Failed to load framework prompt: ${frameworkId}`,
      error
    );
    return null;
  }
}

export function clearFrameworkCache(): void {
  promptCache.clear();
}
