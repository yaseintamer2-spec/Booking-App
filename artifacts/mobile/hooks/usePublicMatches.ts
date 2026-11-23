import { useQuery } from '@tanstack/react-query';
import { getListMatchesQueryKey, listMatches, type Match } from '@workspace/api-client-react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

// These are publishable client credentials. RLS and the narrow RPC protect data;
// this key carries no elevated database permission.
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || 'https://ijarsonyckyskwkiwmjt.supabase.co').replace(/\/+$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_-mcwZOqwmd8qVkyUfFpKZw_5MDdCONE';

type PublicMatchRow = {
  id: string;
  venue_name: string;
  neighborhood: string;
  address: string;
  starts_at: string;
  duration_minutes: number;
  format: '7v7';
  capacity: number;
  age_group: Match['ageGroup'];
  booked_count: number;
  spots_remaining: number;
  price_halalas: number;
  compare_at_price_halalas: number;
  status: 'published';
  referee_included: boolean;
  referee_user_id: string | null;
  referee_name: string | null;
  referee_avatar_url: string | null;
  pitch_rating_average: number | null;
  pitch_rating_count: number;
  water_included: boolean;
  image_url: string;
  image_urls: string[];
  is_demo: boolean;
  created_at: string;
};

async function loadPublicMatches(): Promise<Match[]> {
  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/list_published_matches`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
    }, 8_000);

    if (!response.ok) {
      let message = 'Could not load matches from Supabase.';
      try {
        const body = await response.json();
        if (typeof body?.message === 'string') message = body.message;
        else if (typeof body?.error === 'string') message = body.error;
      } catch { /* Keep the readable fallback for non-JSON gateway errors. */ }
      throw new Error(message);
    }

    const rows = await response.json() as PublicMatchRow[];
    return rows.map((row) => ({
      id: row.id,
      venueName: row.venue_name,
      neighborhood: row.neighborhood,
      address: row.address,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      format: row.format,
      capacity: row.capacity,
      ageGroup: row.age_group,
      bookedCount: row.booked_count,
      spotsRemaining: row.spots_remaining,
      priceHalalas: row.price_halalas,
      compareAtPriceHalalas: row.compare_at_price_halalas,
      status: row.status,
      refereeIncluded: row.referee_included,
      refereeUserId: row.referee_user_id,
      refereeName: row.referee_name,
      refereeAvatarUrl: row.referee_avatar_url,
      pitchRatingAverage: row.pitch_rating_average,
      pitchRatingCount: row.pitch_rating_count,
      waterIncluded: row.water_included,
      imageUrl: row.image_url,
      imageUrls: row.image_urls || [],
      isDemo: row.is_demo,
      createdAt: row.created_at,
    }));
  } catch (supabaseError) {
    // Preserve the existing API as a fallback until every screen has a safe
    // direct Supabase path and the deployed API origin is no longer needed.
    try { return await listMatches(); }
    catch { throw supabaseError; }
  }
}

/** Reads public match cards directly from Supabase's Data API. */
export function usePublicMatches() {
  return useQuery<Match[], Error>({
    queryKey: getListMatchesQueryKey(),
    queryFn: loadPublicMatches,
    retry: false,
    staleTime: 20_000,
  });
}
