/* ============================================================
   SUPABASE CONNECTION
   ============================================================ */

const SUPABASE_URL = "https://taxairinmzoqgqgisuno.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RmDBq_ArjjAz4bCOPlKjnA_uRIsIzn9";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase library did not load. Check the CDN script tag.");
}

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
