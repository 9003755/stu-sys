import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Default client for Students (uses default storage key: sb-<project-ref>-auth-token)
// Modified: Set persistSession to false so closing tab/window clears session (session only in memory)
// OR use sessionStorage instead of localStorage. Supabase default uses localStorage.
// To achieve "close tab = logout", we should use sessionStorage or just disable persistence?
// If we disable persistence (persistSession: false), refresh will also logout user.
// The user request "close page = logout" usually implies sessionStorage behavior.

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage, // Use sessionStorage so data is cleared when tab/browser is closed
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Separate client for Admins (uses distinct storage key to allow simultaneous login)
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'student-system-admin-token',
    storage: sessionStorage, // Use sessionStorage
    persistSession: true,
    detectSessionInUrl: false
  }
})

// Separate client for Super Admins
export const supabaseSuper = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'student-system-super-token',
    storage: sessionStorage, // Use sessionStorage
    persistSession: true,
    detectSessionInUrl: false
  }
})
