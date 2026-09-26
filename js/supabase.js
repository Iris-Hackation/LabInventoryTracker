/* ============================================================
   SUPABASE CONNECTION
   ============================================================ */

const SUPABASE_URL =
    "https://taxairinmzoqgqgisuno.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_RmDBq_ArjjAz4bCOPlKjnA_uRIsIzn9";

/*
   The CDN creates window.supabase.

   We create OUR client as window.supabaseClient
   so there is no name conflict.
*/

if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
) {
    throw new Error(
        "Supabase library did not load. Check the Supabase CDN script."
    );
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

console.log("Supabase connected successfully.");
