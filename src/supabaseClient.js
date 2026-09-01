import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://auomdzoqcowcfehjtsvu.supabase.co";
const supabasePublishableKey = "sb_publishable_k4z2t-BglcCXkCiQfLM1YA_NBeaVLuT";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

