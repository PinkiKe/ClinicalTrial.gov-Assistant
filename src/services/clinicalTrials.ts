import { Trial, ApiQuery } from '../types';

export async function searchTrials(query: ApiQuery, pageSize = 5, signal?: AbortSignal): Promise<{ trials: Trial[]; url: string }> {
  try {
    const response = await fetch('/api/trials/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, pageSize }),
      signal,
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error searching trials via proxy:', error);
    return { trials: [], url: '' };
  }
}

export async function getTrialDetails(nctId: string, signal?: AbortSignal): Promise<Trial | null> {
  try {
    const response = await fetch(`/api/trials/details/${nctId}`, { signal });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching trial details via proxy:', error);
    return null;
  }
}
