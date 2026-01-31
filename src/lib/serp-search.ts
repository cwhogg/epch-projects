import { getJson } from 'serpapi';

export interface SERPOrganicResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  domain: string;
}

export interface SERPRelatedSearch {
  query: string;
}

export interface SERPPeopleAlsoAsk {
  question: string;
  snippet?: string;
}

export interface SERPResult {
  keyword: string;
  organicResults: SERPOrganicResult[];
  peopleAlsoAsk: SERPPeopleAlsoAsk[];
  relatedSearches: SERPRelatedSearch[];
  totalResults?: number;
}

export function isSerpConfigured(): boolean {
  return !!process.env.SERPAPI_KEY;
}

export async function searchGoogle(keyword: string): Promise<SERPResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_KEY not configured');
  }

  try {
    const response = await getJson({
      engine: 'google',
      q: keyword,
      api_key: apiKey,
      num: 10,
    });

    const organicResults: SERPOrganicResult[] = (response.organic_results || [])
      .slice(0, 10)
      .map((r: Record<string, unknown>) => ({
        position: r.position as number,
        title: r.title as string || '',
        link: r.link as string || '',
        snippet: r.snippet as string || '',
        domain: extractDomain(r.link as string || ''),
      }));

    const peopleAlsoAsk: SERPPeopleAlsoAsk[] = (response.related_questions || [])
      .slice(0, 5)
      .map((q: Record<string, unknown>) => ({
        question: q.question as string || '',
        snippet: q.snippet as string || undefined,
      }));

    const relatedSearches: SERPRelatedSearch[] = (response.related_searches || [])
      .slice(0, 8)
      .map((s: Record<string, unknown>) => ({
        query: s.query as string || '',
      }));

    const totalResults = response.search_information?.total_results as number | undefined;

    return {
      keyword,
      organicResults,
      peopleAlsoAsk,
      relatedSearches,
      totalResults,
    };
  } catch (error) {
    console.error(`SERP search failed for "${keyword}":`, error);
    return {
      keyword,
      organicResults: [],
      peopleAlsoAsk: [],
      relatedSearches: [],
    };
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export async function batchSearchGoogle(keywords: string[]): Promise<SERPResult[]> {
  // Run searches sequentially to respect rate limits
  const results: SERPResult[] = [];
  for (const keyword of keywords) {
    const result = await searchGoogle(keyword);
    results.push(result);
  }
  return results;
}
