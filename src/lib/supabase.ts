import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://zmhbrqkzvgajmvhhorba.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing Calibre v2 Supabase publishable key.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
