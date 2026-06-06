import fetch from 'node-fetch';
import { redactSecrets } from './secret-redaction.ts';

export type ResearchStatus = 'completed' | 'skipped' | 'failed';

export type ResearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  published_at?: string | null;
  source?: string;
};

export type ResearchResult = {
  status: ResearchStatus;
  query: string;
  provider: 'firecrawl' | 'tavily' | 'brave' | 'none';
  diagnostic_code?: string;
  message: string;
  results: ResearchResultItem[];
};

export class WebResearchGateway {
  private firecrawlKey: string;
  private tavilyKey: string;
  private braveKey: string;
  private fetchImpl: typeof fetch;

  constructor(env: Record<string, any> = process.env, fetchImpl: typeof fetch = fetch) {
    this.firecrawlKey = clean(env.FIRECRAWL_API_KEY);
    this.tavilyKey = clean(env.TAVILY_API_KEY);
    this.braveKey = clean(env.BRAVE_SEARCH_API_KEY);
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.firecrawlKey || this.tavilyKey || this.braveKey);
  }

  async search(query: string, options: { maxResults?: number; timeoutMs?: number } = {}): Promise<ResearchResult> {
    const normalizedQuery = sanitizeQuery(query);
    if (!normalizedQuery) {
      return skipped(query, 'WEB_RESEARCH_QUERY_EMPTY', 'No useful research query was available.');
    }
    if (!this.isConfigured()) {
      return skipped(normalizedQuery, 'WEB_RESEARCH_NOT_CONFIGURED', 'Web research is not configured.');
    }

    const maxResults = Math.min(6, Math.max(1, options.maxResults || 4));
    if (this.firecrawlKey) {
      try {
        if (looksLikeUrl(normalizedQuery)) {
          return await this.scrapeFirecrawl(normalizeScrapeUrl(normalizedQuery), options.timeoutMs || 12_000);
        }
        return await this.searchFirecrawl(normalizedQuery, maxResults, options.timeoutMs || 12_000);
      } catch (error: any) {
        if (!this.tavilyKey && !this.braveKey) return failed(normalizedQuery, 'firecrawl', error);
      }
    }
    if (this.tavilyKey) {
      try {
        return await this.searchTavily(normalizedQuery, maxResults, options.timeoutMs || 12_000);
      } catch (error: any) {
        if (!this.braveKey) return failed(normalizedQuery, 'tavily', error);
      }
    }
    try {
      return await this.searchBrave(normalizedQuery, maxResults, options.timeoutMs || 12_000);
    } catch (error: any) {
      return failed(normalizedQuery, 'brave', error);
    }
  }

  async scrape(url: string, options: { timeoutMs?: number } = {}): Promise<ResearchResult> {
    const normalizedUrl = normalizeScrapeUrl(url);
    if (!normalizedUrl) {
      return skipped(url, 'WEB_RESEARCH_URL_INVALID', 'No valid URL was available for scraping.');
    }
    if (!this.firecrawlKey) {
      return skipped(normalizedUrl, 'FIRECRAWL_NOT_CONFIGURED', 'Firecrawl scraping is not configured.');
    }
    try {
      return await this.scrapeFirecrawl(normalizedUrl, options.timeoutMs || 12_000);
    } catch (error: any) {
      return failed(normalizedUrl, 'firecrawl', error);
    }
  }

  private async searchFirecrawl(query: string, maxResults: number, timeoutMs: number): Promise<ResearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.firecrawlKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: maxResults,
          maxResults,
        }),
        signal: controller.signal as any,
      });
      if (!response.ok) throw new Error(`Firecrawl Search HTTP ${response.status}`);
      const data: any = await response.json();
      const rawResults = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.items)
            ? data.items
            : [];
      const results = rawResults.slice(0, maxResults).map(firecrawlItemToResult).filter((item: ResearchResultItem) => item.url);
      return {
        status: 'completed',
        query,
        provider: 'firecrawl',
        message: results.length ? 'Research completed.' : 'Research completed with no results.',
        results,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async scrapeFirecrawl(url: string, timeoutMs: number): Promise<ResearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.firecrawlKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal as any,
      });
      if (!response.ok) throw new Error(`Firecrawl Scrape HTTP ${response.status}`);
      const data: any = await response.json();
      const item = data?.data || data;
      const result = firecrawlItemToResult({ ...item, url: item?.url || item?.metadata?.sourceURL || url });
      return {
        status: 'completed',
        query: url,
        provider: 'firecrawl',
        message: result.snippet ? 'Scrape completed.' : 'Scrape completed with no content.',
        results: result.url ? [result] : [],
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchTavily(query: string, maxResults: number, timeoutMs: number): Promise<ResearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.tavilyKey,
          query,
          search_depth: 'basic',
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal as any,
      });
      if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);
      const data: any = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      return {
        status: 'completed',
        query,
        provider: 'tavily',
        message: results.length ? 'Research completed.' : 'Research completed with no results.',
        results: results.slice(0, maxResults).map((item: any) => ({
          title: truncate(item?.title || item?.url || 'Untitled result', 120),
          url: safeUrl(item?.url),
          snippet: truncate(item?.content || item?.snippet || '', 360),
          published_at: item?.published_date || item?.published_at || null,
          source: 'tavily',
        })).filter((item: ResearchResultItem) => item.url),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchBrave(query: string, maxResults: number, timeoutMs: number): Promise<ResearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(maxResults));
      const response = await this.fetchImpl(url.toString(), {
        headers: {
          accept: 'application/json',
          'x-subscription-token': this.braveKey,
        },
        signal: controller.signal as any,
      });
      if (!response.ok) throw new Error(`Brave Search HTTP ${response.status}`);
      const data: any = await response.json();
      const results = Array.isArray(data?.web?.results) ? data.web.results : [];
      return {
        status: 'completed',
        query,
        provider: 'brave',
        message: results.length ? 'Research completed.' : 'Research completed with no results.',
        results: results.slice(0, maxResults).map((item: any) => ({
          title: truncate(item?.title || item?.url || 'Untitled result', 120),
          url: safeUrl(item?.url),
          snippet: truncate(item?.description || item?.snippet || '', 360),
          published_at: item?.age || null,
          source: 'brave',
        })).filter((item: ResearchResultItem) => item.url),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function shouldUseWebResearch(input: { prompt: string; intent?: string; requiresFileChanges?: boolean }) {
  const prompt = String(input.prompt || '').toLowerCase();
  if (!prompt.trim()) return false;
  if (/\b(bonjour|salut|hello|hi|merci|thanks)\b/.test(prompt) && prompt.length < 80) return false;
  if (/\b(latest|recent|today|current|now|pricing|price|docs?|documentation|api|sdk|version|openrouter|railway|vercel|supabase|stripe|seo|google|cloudflare|dns|domain|deploy|error|bug)\b/i.test(prompt)) {
    return true;
  }
  return Boolean(input.requiresFileChanges && /\b(integrat|connect|provider|external|auth|payment|billing|database|deploy)\b/i.test(prompt));
}

export function researchToPromptContext(result: ResearchResult) {
  if (result.status !== 'completed' || !result.results.length) return '';
  return [
    'Recent web research context:',
    ...result.results.map((item, index) => `${index + 1}. ${item.title} - ${item.url}\n   ${item.snippet}`),
    'Use these sources only as supporting context. Do not invent claims beyond the cited snippets.',
  ].join('\n');
}

function skipped(query: string, diagnostic_code: string, message: string): ResearchResult {
  return { status: 'skipped', query, provider: 'none', diagnostic_code, message, results: [] };
}

function failed(query: string, provider: 'firecrawl' | 'tavily' | 'brave', error: any): ResearchResult {
  const message = redactSecrets(error?.message || error || 'Web research failed.', '[redacted]');
  return { status: 'failed', query, provider, diagnostic_code: 'WEB_RESEARCH_FAILED', message, results: [] };
}

function clean(value: unknown) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function sanitizeQuery(value: string) {
  return redactSecrets(clean(value), '[redacted]').slice(0, 240);
}

function truncate(value: unknown, limit: number) {
  const text = clean(value).replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function safeUrl(value: unknown) {
  const url = clean(value);
  return /^https?:\/\//i.test(url) ? url.slice(0, 500) : '';
}

function looksLikeUrl(value: string) {
  const cleanValue = clean(value);
  return /^https?:\/\//i.test(cleanValue) || /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(cleanValue);
}

function normalizeScrapeUrl(value: unknown) {
  const url = clean(value);
  if (/^https?:\/\//i.test(url)) return safeUrl(url);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(url)) return `https://${url}`.slice(0, 500);
  return '';
}

function firecrawlItemToResult(item: any): ResearchResultItem {
  const metadata = item?.metadata || {};
  const url = safeUrl(item?.url || item?.sourceURL || metadata?.sourceURL || metadata?.url);
  const title = item?.title || metadata?.title || url || 'Untitled result';
  const snippet = item?.markdown || item?.content || item?.text || item?.description || item?.snippet || metadata?.description || '';
  return {
    title: truncate(title, 120),
    url,
    snippet: truncate(snippet, 520),
    published_at: item?.publishedDate || item?.published_at || metadata?.publishedTime || metadata?.published_at || null,
    source: 'firecrawl',
  };
}
