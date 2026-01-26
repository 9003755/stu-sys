import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Default client for Students (uses default storage key: sb-<project-ref>-auth-token)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Separate client for Admins (uses distinct storage key to allow simultaneous login)
// IMPORTANT: persistSession must be true to maintain login state.
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'student-system-admin-token',
    persistSession: true,
    detectSessionInUrl: false
  }
})

// Separate client for Super Admins
export const supabaseSuper = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'student-system-super-token',
    persistSession: true,
    detectSessionInUrl: false
  }
})
