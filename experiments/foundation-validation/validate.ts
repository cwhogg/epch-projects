import { buildContentContext } from '../../src/lib/content-agent';
import { buildBlogPostPrompt } from '../../src/lib/content-prompts';
import { getAnthropic } from '../../src/lib/anthropic';
import { CLAUDE_MODEL } from '../../src/lib/config';
import { promises as fs } from 'fs';
import path from 'path';

const IDEA_ID = process.argv[2];
if (!IDEA_ID) {
  console.error('Usage: npx tsx experiments/foundation-validation/validate.ts <ideaId>');
  process.exit(1);
}

const STRATEGY_PROMPT = `You are Richard Rumelt, author of "Good Strategy Bad Strategy."
Analyze this product idea and write a concise strategy document covering:
1. The Challenge — what's the core problem/opportunity?
2. The Guiding Policy — what's the fundamental approach?
3. Coherent Actions — what specific steps follow from the policy?

Be specific. Avoid fluffy language. Name the tradeoffs.`;

const POSITIONING_PROMPT = `You are April Dunford, author of "Obviously Awesome."
Given this strategy, write a positioning statement covering:
1. Competitive alternatives — what would customers use if this didn't exist?
2. Unique attributes — what does this offer that alternatives don't?
3. Value — what does the unique capability enable for customers?
4. Target customer — who cares most about this value?
5. Market category — where does this compete?

Be concrete. Use the strategy to ground every claim.`;

async function main() {
  const ctx = await buildContentContext(IDEA_ID);
  if (!ctx) throw new Error(`No analysis found for idea ${IDEA_ID}`);

  const anthropic = getAnthropic();
  const outDir = path.join(__dirname, 'output');
  await fs.mkdir(outDir, { recursive: true });

  console.log('Generating Strategy...');
  const strategyRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: STRATEGY_PROMPT,
    messages: [{ role: 'user', content: `Product: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\nTarget User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}\n\nCompetitor landscape:\n${ctx.competitors}\n\nSEO opportunities:\n${ctx.contentStrategy.topOpportunities.join('\n')}` }],
  });
  const strategy = strategyRes.content[0].type === 'text' ? strategyRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'strategy.md'), strategy);

  console.log('Generating Positioning...');
  const positioningRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: POSITIONING_PROMPT,
    messages: [{ role: 'user', content: `Strategy:\n${strategy}\n\nProduct: ${ctx.ideaName}\nTarget User: ${ctx.targetUser}` }],
  });
  const positioning = positioningRes.content[0].type === 'text' ? positioningRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'positioning.md'), positioning);

  // Pick first pending blog-post piece for comparison
  const mockPiece = {
    id: 'validation-test',
    ideaId: IDEA_ID,
    type: 'blog-post' as const,
    title: `Why ${ctx.ideaName} Changes Everything`,
    slug: 'validation-test',
    targetKeywords: ctx.topKeywords.slice(0, 3).map(k => k.keyword),
    priority: 1,
    rationale: 'Validation test piece',
    status: 'pending' as const,
  };

  console.log('Generating blog post WITHOUT foundation docs...');
  const promptWithout = buildBlogPostPrompt(ctx, mockPiece);
  const withoutRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: promptWithout }],
  });
  const blogWithout = withoutRes.content[0].type === 'text' ? withoutRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'blog-WITHOUT-foundation.md'), blogWithout);

  console.log('Generating blog post WITH foundation docs...');
  const foundationContext = `\n\nFOUNDATION DOCUMENTS:\n\n## Strategy\n${strategy}\n\n## Positioning\n${positioning}\n\nUse these foundation documents to ground your writing. The positioning statement defines WHO this is for, WHY it's different, and WHAT category it competes in. Reference these claims specifically — don't make up new positioning.\n\n`;
  const promptWith = foundationContext + promptWithout;
  const withRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: promptWith }],
  });
  const blogWith = withRes.content[0].type === 'text' ? withRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'blog-WITH-foundation.md'), blogWith);

  console.log('\nDone! Compare the outputs in experiments/foundation-validation/output/');
  console.log('- strategy.md');
  console.log('- positioning.md');
  console.log('- blog-WITHOUT-foundation.md');
  console.log('- blog-WITH-foundation.md');
}

main().catch(console.error);
