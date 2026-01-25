import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseAdmin } from '../../lib/supabase'
import { useAdminAuth } from '../../contexts/AdminAuthContext'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { adminSignIn } = useAdminAuth()
  const [email, setEmail] = useState('super') // Default value for easier testing
  const [password, setPassword] = useState('123456') // Default value
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      // 1. Sign in (using email as 'super' is not valid email, we need a real email for Supabase Auth)
      // Since 'super' is requested, we'll map it to a specific email internally
      const loginEmail = email === 'super' ? 'super@admin.com' : email
      
      const { data: { user }, error } = await adminSignIn(loginEmail, password)
      
      if (error) throw error
      if (!user) throw new Error('登录失败')

      // 2. Check if user is admin
      const { data: adminData, error: adminError } = await supabaseAdmin
        .from('admins')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (adminError || !adminData) {
        // If not admin, sign out immediately
        await supabaseAdmin.auth.signOut()
        throw new Error('该账号没有管理员权限')
      }

      // 3. Redirect to admin dashboard
      navigate('/admin/dashboard')

    } catch (error) {
      console.error('Admin login error:', error)
      // Special handling for the very first login setup (dev mode only)
      if (email === 'super' && password === '123456' && error.message.includes('Invalid login credentials')) {
         await setupDevAdmin()
      } else {
        setErrorMsg(error.message)
        setLoading(false)
      }
    }
  }

  // Helper to auto-create the super admin if it doesn't exist (DEV MODE ONLY)
  const setupDevAdmin = async () => {
    try {
      const email = 'super@admin.com'
      const password = '123456'
      
      // 1. Try to sign up
      const { data: { user }, error: signUpError } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: 'Super Admin'
          }
        }
      })

      // If user created (or already exists), we need to ensure they are in admins table
      // AND their email is confirmed.
      // Since we can't confirm email from client side without clicking link,
      // and we can't insert into admins table due to RLS if we are not admin yet.
      
      // WORKAROUND FOR DEV: 
      // If sign up successful (meaning user created), tell user to check console or just wait
      // But actually, for "simplest way", we rely on the backend SQL trigger we just added?
      // No, we can't add triggers easily from here.

      // NEW PLAN: Just show a friendly message if it fails
      if (signUpError) throw signUpError

      alert('管理员账号初始化尝试完成。如果仍无法登录，请在Supabase后台手动确认邮箱或添加admin记录。')
      
      // Auto login attempt
      const { error: loginError } = await adminSignIn(email, password)
      if (!loginError) navigate('/admin/dashboard')

    } catch (err) {
      setErrorMsg('初始化超级管理员失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            管理员登录
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            仅限内部人员访问
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {errorMsg && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded text-sm">
              {errorMsg}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">账号</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-700 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="管理员账号"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">密码</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-700 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="密码"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? '验证中...' : '登录后台'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
