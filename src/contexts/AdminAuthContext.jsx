import { createContext, useContext, useEffect, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'

const AdminAuthContext = createContext({})

export const useAdminAuth = () => useContext(AdminAuthContext)

export const AdminAuthProvider = ({ children }) => {
  const [adminUser, setAdminUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active sessions and set the user
    supabaseAdmin.auth.getSession().then(({ data: { session } }) => {
      setAdminUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for changes on auth state
    const { data: { subscription } } = supabaseAdmin.auth.onAuthStateChange((_event, session) => {
      setAdminUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const adminSignIn = async (email, password) => {
    return await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })
  }

  const adminSignOut = async () => {
    return await supabaseAdmin.auth.signOut()
  }

  return (
    <AdminAuthContext.Provider value={{ adminUser, adminSignIn, adminSignOut, loading }}>
      {!loading && children}
    </AdminAuthContext.Provider>
  )
}
