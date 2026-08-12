import { ApiQuery, Trial } from "../types";

export type QueryIntent = 'search' | 'chat' | 'results_lookup';

export interface ParsedQuery extends ApiQuery {
  intent: QueryIntent;
  nctId?: string;
  nctIds?: string[];
}

export function isGeminiRateLimited(): { limited: boolean; timeLeftMs: number; timeLeftMinutes: number } {
  // Local limits are bypassed at the request of the user, always return false
  return { limited: false, timeLeftMs: 0, timeLeftMinutes: 0 };
}

export function setGeminiRateLimit(retryAfterMs: number) {
  const blockedUntil = Date.now() + retryAfterMs;
  localStorage.setItem('gemini_blocked_until', blockedUntil.toString());
  
  const event = new CustomEvent('gemini-rate-limit-exceeded', {
    detail: {
      retryAfterMs,
      retryAfterMinutes: Math.ceil(retryAfterMs / 1000 / 60)
    }
  });
  window.dispatchEvent(event);
}

export async function parseQuery(userInput: string): Promise<ParsedQuery> {
  const limitState = isGeminiRateLimited();
  if (limitState.limited) {
    setGeminiRateLimit(limitState.timeLeftMs);
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  try {
    const response = await fetch('/api/gemini/parseQuery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userInput }),
    });
    
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retryMs = data.retryAfterMs || 60000;
      setGeminiRateLimit(retryMs);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('Error parsing query with Gemini via proxy:', error);
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      throw error;
    }
    return { intent: 'chat', term: userInput }; 
  }
}

export async function summarizeTrial(trial: Trial, lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const isEn = lang === 'en';
  const limitState = isGeminiRateLimited();
  if (limitState.limited) {
    setGeminiRateLimit(limitState.timeLeftMs);
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  try {
    const response = await fetch('/api/gemini/summarizeTrial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trial, lang }),
    });
    
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retryMs = data.retryAfterMs || 60000;
      setGeminiRateLimit(retryMs);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    return data.summary;
  } catch (error: any) {
    console.error('Error summarizing trial with Gemini via proxy:', error);
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      throw error;
    }
    return isEn ? "Error occurred during summary generation." : "生成摘要時發生錯誤。";
  }
}

export async function chatAboutTrials(userInput: string, trials: Trial[], lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const isEn = lang === 'en';
  const limitState = isGeminiRateLimited();
  if (limitState.limited) {
    setGeminiRateLimit(limitState.timeLeftMs);
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  try {
    const response = await fetch('/api/gemini/chatAboutTrials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userInput, trials, lang }),
    });
    
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retryMs = data.retryAfterMs || 60000;
      setGeminiRateLimit(retryMs);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    return data.response;
  } catch (error: any) {
    console.error('Error in chatAboutTrials via proxy:', error);
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      throw error;
    }
    return isEn ? "Sorry, an error occurred while processing your request." : "抱歉，處理您的請求時發生錯誤。";
  }
}

export async function analyzeCohort(
  trials: Trial[], 
  lang: 'zh' | 'en' = 'zh',
  options?: {
    endpointType?: string;
    effectMetric?: string;
    poolingModel?: string;
    customDataSummary?: string;
    pooledStats?: string;
  }
): Promise<string> {
  const isEn = lang === 'en';
  const limitState = isGeminiRateLimited();
  if (limitState.limited) {
    setGeminiRateLimit(limitState.timeLeftMs);
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  try {
    const response = await fetch('/api/gemini/metaAnalysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trials, lang, options }),
    });
    
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retryMs = data.retryAfterMs || 60000;
      setGeminiRateLimit(retryMs);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    return data.response;
  } catch (error: any) {
    console.error('Error in analyzeCohort via proxy:', error);
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      throw error;
    }
    return isEn 
      ? "An error occurred while generating the meta-analysis synthesis." 
      : "在生成統合分析報告時發生錯誤。";
  }
}

export interface SaeSearchResponse {
  matchedTerm: string;
  alignedTrialTerms: Record<string, string>;
  allMatchingTerms: string[];
  confidence: number;
}

export async function searchAdverseEvents(
  userInput: string,
  trials: Trial[],
  lang: 'zh' | 'en' = 'zh',
  signal?: AbortSignal
): Promise<SaeSearchResponse> {
  const limitState = isGeminiRateLimited();
  if (limitState.limited) {
    setGeminiRateLimit(limitState.timeLeftMs);
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  try {
    const response = await fetch('/api/gemini/searchAdverseEvents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userInput, trials, lang }),
      signal,
    });
    
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retryMs = data.retryAfterMs || 60000;
      setGeminiRateLimit(retryMs);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('Error searching adverse events with Gemini via proxy:', error);
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      throw error;
    }
    return {
      matchedTerm: "",
      alignedTrialTerms: {},
      allMatchingTerms: [],
      confidence: 0
    };
  }
}


