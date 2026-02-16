import * as prompts from './prompts';

const promptMap: Record<string, string> = {
  'richard-rumelt': prompts.richardRumelt,
  'april-dunford': prompts.aprilDunford,
  'copywriter': prompts.copywriter,
  'seo-expert': prompts.seoExpert,
  'shirin-oreizy': prompts.shirinOreizy,
  'joe-pulizzi': prompts.joePulizzi,
  'robb-wolf': prompts.robbWolf,
  'robbie-kellman-baxter': prompts.robbieKellmanBaxter,
  'rob-walling': prompts.robWalling,
  'patrick-campbell': prompts.patrickCampbell,
};

export function getAdvisorSystemPrompt(advisorId: string): string {
  const prompt = promptMap[advisorId];
  if (!prompt) throw new Error(`Unknown advisor: ${advisorId}`);
  return prompt;
}
