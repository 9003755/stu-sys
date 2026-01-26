import { createContext, useContext, useState, useEffect } from 'react'
import { supabaseSuper } from '../lib/supabase'

const SuperAuthContext = createContext({})

export const useSuperAuth = () => useContext(SuperAuthContext)

export const SuperAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active session
    supabaseSuper.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for changes
    const { data: { subscription } } = supabaseSuper.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const superSignIn = async (email, password) => {
    return supabaseSuper.auth.signInWithPassword({ email, password })
  }

  const superSignOut = async () => {
    return supabaseSuper.auth.signOut()
  }

  return (
    <SuperAuthContext.Provider value={{ user, superSignIn, superSignOut, loading }}>
      {children}
    </SuperAuthContext.Provider>
  )
}
