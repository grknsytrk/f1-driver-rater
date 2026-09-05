import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
const isTestEnvironment = import.meta.env.MODE === 'test';

// Keep the local-only experience working until Supabase is configured.
// Vitest runs in Node/happy-dom, where Supabase Realtime has no native WebSocket.
// The app does not use Realtime, so avoid constructing that client in tests.
export const supabase = !isTestEnvironment && supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    })
    : null;
