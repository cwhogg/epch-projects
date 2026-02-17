import { promises as fs } from 'fs';
import path from 'path';
import { ContentPiece, ContentCalendar } from '@/types';
import { slugify } from './utils';

export function getContentDir(ideaName: string): string {
  return path.join(process.cwd(), 'experiments', slugify(ideaName), 'content');
}

export function getFilename(piece: ContentPiece): string {
  switch (piece.type) {
    case 'blog-post':
      return `blog-${piece.slug}.md`;
    case 'comparison':
      return `comparison-${piece.slug}.md`;
    case 'faq':
      return `faq-${piece.slug}.md`;
    default:
      return `${piece.slug}.md`;
  }
}

export async function writeContentToVault(ideaName: string, piece: ContentPiece): Promise<void> {
  if (!piece.markdown) return;

  const dir = getContentDir(ideaName);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, getFilename(piece));
  await fs.writeFile(filePath, piece.markdown, 'utf-8');
}

export async function writeCalendarIndex(ideaName: string, calendar: ContentCalendar): Promise<void> {
  const dir = getContentDir(ideaName);
  await fs.mkdir(dir, { recursive: true });

  const lines: string[] = [
    '---',
    `title: "Content Calendar — ${calendar.ideaName}"`,
    `type: calendar-index`,
    `generatedAt: "${calendar.createdAt}"`,
    `ideaName: "${calendar.ideaName}"`,
    `totalPieces: ${calendar.pieces.length}`,
    '---',
    '',
    `# Content Calendar: ${calendar.ideaName}`,
    '',
    `## Strategy`,
    '',
    calendar.strategySummary,
    '',
    `## Content Pieces`,
    '',
    '| # | Type | Title | Target Keywords | Status |',
    '|---|------|-------|----------------|--------|',
  ];

  for (const piece of calendar.pieces) {
    const keywords = piece.targetKeywords.slice(0, 3).join(', ');
    lines.push(`| ${piece.priority} | ${piece.type} | ${piece.title} | ${keywords} | ${piece.status} |`);
  }

  const filePath = path.join(dir, '_calendar.md');
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}
