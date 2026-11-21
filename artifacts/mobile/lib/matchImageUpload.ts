import { apiBaseUrl } from '@/lib/apiBaseUrl';

export async function uploadMatchImages(images: string[], getToken: () => Promise<string | null | undefined>): Promise<string[]> {
  const stored: string[] = [];
  for (const imageDataUrl of images) {
    if (!imageDataUrl.startsWith('data:image/')) {
      stored.push(imageDataUrl);
      continue;
    }
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api/match-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ imageDataUrl }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://')) {
      throw new Error(result.error || 'Could not upload a pitch photo. Check your connection and try again.');
    }
    stored.push(result.url);
  }
  return stored;
}
