/**
 * Strip markdown code fences, attempt JSON.parse, fall back to regex extraction.
 */
export function parseLLMJson<T>(text: string): T {
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Attempt 1: direct parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Attempt 2: clean common LLM mistakes then parse
    try {
      return JSON.parse(cleanJSONString(jsonStr)) as T;
    } catch {
      // Attempt 3: extract JSON object from surrounding text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(cleanJSONString(jsonMatch[0])) as T;
        } catch {
          // Fall through
        }
      }
    }
    throw new Error('Failed to parse JSON from LLM response');
  }
}

/**
 * Strip trailing commas and comments from JSON strings (common LLM mistakes).
 */
export function cleanJSONString(str: string): string {
  // Remove trailing commas before } or ]
  let cleaned = str.replace(/,\s*([\]}])/g, '$1');
  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned;
}
