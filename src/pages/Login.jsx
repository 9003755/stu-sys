import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { useForm } from 'react-hook-form'
import { supabaseAdmin } from '../lib/supabase'
import { User, ShieldCheck } from 'lucide-react'

export default function Login() {
  const { signIn } = useAuth()
  const { adminSignIn } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  // 'student' or 'admin'
  const [role, setRole] = useState('student')
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Check URL query param for role
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const roleParam = params.get('role')
    if (roleParam === 'admin') {
      setRole('admin')
    }
  }, [location])

  const onSubmit = async (data) => {
    setLoading(true)
    setErrorMsg('')
    
    try {
      if (role === 'student') {
        // Student Login
        const { error } = await signIn(data.email, data.password)
        if (error) throw error
        navigate('/')
      } else {
        // Admin Login
        // 1. Map 'super' to real email if needed (legacy dev support)
        const loginEmail = data.email === 'super' ? 'super@admin.com' : data.email
        
        const { data: { user }, error } = await adminSignIn(loginEmail, data.password)
        
        if (error) throw error
        if (!user) throw new Error('登录失败')

        // 2. Check if user is admin
        const { data: adminData, error: adminError } = await supabaseAdmin
          .from('admins')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (adminError || !adminData) {
          await supabaseAdmin.auth.signOut()
          throw new Error('该账号没有管理员权限')
        }

        navigate('/admin/dashboard')
      }
    } catch (error) {
      console.error('Login error:', error)
      // Special dev handler for admin
      if (role === 'admin' && data.email === 'super' && data.password === '123456' && error.message.includes('Invalid login credentials')) {
         await setupDevAdmin()
      } else {
        setErrorMsg(error.message)
        setLoading(false)
      }
    } finally {
      if (!(role === 'admin' && data.email === 'super' && loading)) {
         setLoading(false)
      }
    }
  }

  // Helper to auto-create the super admin (DEV MODE ONLY)
  const setupDevAdmin = async () => {
    try {
      const email = 'super@admin.com'
      const password = '123456'
      const { error: signUpError } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: { data: { full_name: 'Super Admin' } }
      })
      if (signUpError) throw signUpError
      alert('管理员账号初始化尝试完成。如果仍无法登录，请在Supabase后台手动确认邮箱或添加admin记录。')
      const { error: loginError } = await adminSignIn(email, password)
      if (!loginError) navigate('/admin/dashboard')
    } catch (err) {
      setErrorMsg('初始化超级管理员失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center vercel-hero-bg py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-md w-full space-y-8 vercel-card p-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--vercel-ink)]">
            无人机培训学员注册系统
          </h1>
          <div className="mt-4 rounded-xl border border-[var(--vercel-hairline)] bg-[var(--vercel-canvas-soft)] p-4 text-left text-sm text-[var(--vercel-body)] space-y-2">
            <p>学员资料可按 UOM 批量上传格式导出，减少重复录入。</p>
            <p>身份证正反面可自动合并为 PDF 统一下载。</p>
            <p>手机端报名推荐使用系统浏览器、微信或 Chrome。</p>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="flex rounded-full border border-[var(--vercel-hairline)] bg-[var(--vercel-canvas-soft)] p-1">
          <button
            type="button"
            onClick={() => { setRole('student'); reset(); setErrorMsg(''); }}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-full transition-all ${
              role === 'student' 
                ? 'bg-[var(--vercel-ink)] text-white shadow-sm' 
                : 'text-[var(--vercel-mute)] hover:text-[var(--vercel-ink)]'
            }`}
          >
            <User size={18} className="mr-2" />
            学员登录
          </button>
          <button
            type="button"
            onClick={() => { setRole('admin'); reset(); setErrorMsg(''); }}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-full transition-all ${
              role === 'admin' 
                ? 'bg-[var(--vercel-ink)] text-white shadow-sm' 
                : 'text-[var(--vercel-mute)] hover:text-[var(--vercel-ink)]'
            }`}
          >
            <ShieldCheck size={18} className="mr-2" />
            管理员登录
          </button>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">
              {errorMsg}
            </div>
          )}
          
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--vercel-body)] mb-1">
                {role === 'admin' ? '管理员账号' : '邮箱地址'}
              </label>
              <input
                id="email"
                type={role === 'admin' ? "text" : "email"}
                autoComplete="email"
                required
                className="appearance-none block w-full px-3 py-2 border border-[var(--vercel-hairline)] rounded-md bg-white text-sm text-[var(--vercel-ink)] placeholder-[var(--vercel-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--vercel-link)] focus:border-transparent"
                placeholder={role === 'admin' ? "请输入管理员账号" : "请输入注册邮箱"}
                {...register("email", { required: true })}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--vercel-body)] mb-1">密码</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none block w-full px-3 py-2 border border-[var(--vercel-hairline)] rounded-md bg-white text-sm text-[var(--vercel-ink)] placeholder-[var(--vercel-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--vercel-link)] focus:border-transparent"
                placeholder="请输入密码"
                {...register("password", { required: true })}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full inline-flex items-center justify-center rounded-full bg-[var(--vercel-ink)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-[var(--vercel-link)] focus:ring-offset-2 focus:ring-offset-[var(--vercel-canvas)] disabled:opacity-70"
            >
              {loading ? '验证中...' : (role === 'admin' ? '进入管理后台' : '登录系统')}
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 right-4 text-xs text-[var(--vercel-mute)] opacity-60 hover:opacity-100 transition-opacity">
        by 海边的飞行器
      </div>
    </div>
  )
}
