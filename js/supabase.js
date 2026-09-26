/* ============================================================
   SUPABASE CONNECTION
   ------------------------------------------------------------
   Browser-safe Supabase configuration.
   ============================================================ */

const SUPABASE_URL = "https://taxairinmzoqgqgisuno.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_RmDBq_ArjjAz4bCOPlKjnA_uRIsIzn9";

/*
 * Create the Supabase client once and expose it globally.
 *
 * IMPORTANT:
 * Do NOT use:
 *     const supabase = ...
 *
 * Using window.supabaseClient avoids a naming collision with
 * the Supabase CDN's global `window.supabase` object.
 */

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);
