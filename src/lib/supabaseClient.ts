import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
const isTestEnvironment = import.meta.env.MODE === 'test';

// Keep the local-only experience working until Supabase is configured.
// Vitest runs in Node/happy-dom, where Supabase Realtime has no native WebSocket.
// The app does not use Realtime, so avoid constructing that client in tests.
export const isSupabaseConfigured = Boolean(
    !isTestEnvironment && supabaseUrl && supabasePublishableKey,
);

let clientPromise: Promise<SupabaseClient | null> | null = null;

// Lazily load @supabase/supabase-js on first cloud sync / community read so the
// initial landing bundle does not eagerly download the Supabase SDK.
export function getSupabaseClient(): Promise<SupabaseClient | null> {
    if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) {
        return Promise.resolve(null);
    }

    if (!clientPromise) {
        clientPromise = import('@supabase/supabase-js')
            .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false,
                },
            }))
            .catch(() => {
                clientPromise = null;
                return null;
            });
    }

    return clientPromise;
}
