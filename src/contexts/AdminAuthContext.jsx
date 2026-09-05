import { createContext, useContext, useEffect, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'

const AdminAuthContext = createContext({})
const withTimeout = (promise, message, timeoutMs = 15000) => Promise.race([
  promise,
  new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
])

export const useAdminAuth = () => useContext(AdminAuthContext)

export const AdminAuthProvider = ({ children }) => {
  const [adminUser, setAdminUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active sessions and set the user
    withTimeout(supabaseAdmin.auth.getSession(), '管理员会话验证超时，请检查网络后刷新页面。')
      .then(({ data: { session } }) => setAdminUser(session?.user ?? null))
      .catch(() => setAdminUser(null))
      .finally(() => setLoading(false))

    // Listen for changes on auth state
    const { data: { subscription } } = supabaseAdmin.auth.onAuthStateChange((_event, session) => {
      setAdminUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const adminSignIn = async (email, password) => {
    const { data, error } = await withTimeout(supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    }), '登录请求超时，请检查网络连接后重试。')
    
    if (error) return { data, error }
    
    // Safely check if user object exists before accessing id
    if (!data?.user) {
        return { data: null, error: { message: '登录返回数据异常' } }
    }
    
    // Check if user is actually an admin
    const { data: adminData, error: adminError } = await withTimeout(supabaseAdmin
      .from('admins')
      .select('id')
      .eq('user_id', data.user.id)
      .single(), '管理员权限验证超时，请检查网络连接后重试。')
      
    if (adminError || !adminData) {
      // Not an admin, sign out immediately
      await supabaseAdmin.auth.signOut()
      return { 
        data: null, 
        error: { message: '该账号没有管理员权限' } 
      }
    }
    
    setAdminUser(data.user)
    setLoading(false)
    return { data, error: null }
  }

  const adminSignOut = async () => {
    return await supabaseAdmin.auth.signOut()
  }

  return (
    <AdminAuthContext.Provider value={{ adminUser, adminSignIn, adminSignOut, loading }}>
      {children}
    </AdminAuthContext.Provider>
  )
}
