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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            无人机培训学员注册系统
          </h1>
          <div className="mt-4 text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-100 text-left space-y-2">
            <p className="flex items-start">
              <span className="mr-2">💡</span>
              <span>学员资料自动按照UOM学员批量上传的格式打包下载，可直接上传UOM无重复工作</span>
            </p>
            <p className="flex items-start">
              <span className="mr-2">📄</span>
              <span>学员身份证正反面自动合并成pdf文件下载</span>
            </p>
            <p className="flex items-start">
              <span className="mr-2">📱</span>
              <span>手机端注册需用谷歌浏览器</span>
            </p>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => { setRole('student'); reset(); setErrorMsg(''); }}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${
              role === 'student' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User size={18} className="mr-2" />
            学员登录
          </button>
          <button
            type="button"
            onClick={() => { setRole('admin'); reset(); setErrorMsg(''); }}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${
              role === 'admin' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                {role === 'admin' ? '管理员账号' : '邮箱地址'}
              </label>
              <input
                id="email"
                type={role === 'admin' ? "text" : "email"}
                autoComplete="email"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder={role === 'admin' ? "请输入管理员账号" : "请输入注册邮箱"}
                {...register("email", { required: true })}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="请输入密码"
                {...register("password", { required: true })}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 transition-colors shadow-sm"
            >
              {loading ? '验证中...' : (role === 'admin' ? '进入管理后台' : '登录系统')}
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-300 opacity-60 hover:opacity-100 transition-opacity">
        by 海边的飞行器
      </div>
    </div>
  )
}
