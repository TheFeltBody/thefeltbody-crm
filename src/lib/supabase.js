import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Fail loud at startup rather than letting a misconfigured deploy run silently.
  // Both must be present in .env.local (dev) or Cloudflare Pages env vars (prod).
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,        // keep session in localStorage across page reloads
    autoRefreshToken: true,      // refresh JWT before it expires
    detectSessionInUrl: true,    // pick up the magic-link callback hash automatically
  },
});
