import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSuperAuth } from '../../contexts/SuperAuthContext'
import { supabaseSuper } from '../../lib/supabase'
import { ShieldAlert, Lock, Mail } from 'lucide-react'

export default function SuperLogin() {
  const navigate = useNavigate()
  const { superSignIn } = useSuperAuth()
  const [step, setStep] = useState(1) // 1: Password, 2: Email OTP
  const [email, setEmail] = useState('neoyt@126.com') // Fixed account
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      if (email !== 'neoyt@126.com') {
        throw new Error('无效的超级管理员账号')
      }

      // 1. Validate Password
      const { error } = await superSignIn(email, password)
      
      if (error) {
        // Auto-setup logic for first run
        if (error.message.includes('Invalid login credentials') && password === 'Super1234') {
           try {
             console.log('Attempting to initialize super admin account...')
             const { data: signUpData, error: signUpError } = await supabaseSuper.auth.signUp({
               email,
               password,
               options: { data: { full_name: 'Super Admin' } }
             })
             
             if (signUpError) throw signUpError
             
             // Auto-add to public.admins table so it behaves like a normal admin too
             if (signUpData.user) {
               await supabaseSuper.from('admins').insert([{
                 user_id: signUpData.user.id,
                 full_name: '超级管理员'
               }])
             }

             // Retry login immediately after signup
             const { error: retryError } = await superSignIn(email, password)
             if (retryError) throw retryError
             
             // If successful, proceed
             setStep(2)
             return
           } catch (setupError) {
             console.error('Setup failed:', setupError)
             throw error // Throw original error if setup fails
           }
        }
        throw error
      }

      // 2. Trigger 2FA (Simulated for now, real implementation needs backend support or Supabase MFA)
      // Since Supabase generic MFA requires setup, we'll simulate the "Trigger" phase here
      // In a real app, this would call a cloud function to send an email
      
      setStep(2)
      // alert('验证码已发送至您的邮箱 (模拟: 123456)')

    } catch (error) {
      setErrorMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOtpVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      // Validate OTP (Mock: 123456)
      if (otp !== '123456') {
        throw new Error('验证码错误')
      }

      // Success
      navigate('/super/dashboard')
    } catch (error) {
      setErrorMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
        <div className="text-center">
          <ShieldAlert size={48} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            超级管理员控制台
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            最高权限访问入口
          </p>
        </div>

        {step === 1 ? (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordLogin}>
            {errorMsg && (
              <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded text-sm">
                {errorMsg}
              </div>
            )}
            
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">账号</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 text-gray-300 bg-gray-700 focus:outline-none sm:text-sm opacity-70 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">密码</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 text-white bg-gray-700 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                    placeholder="请输入超级管理员密码"
                  />
                  <Lock size={16} className="absolute right-3 top-2.5 text-gray-500" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-70 transition-colors shadow-lg"
            >
              {loading ? '验证中...' : '下一步'}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleOtpVerify}>
            <div className="bg-blue-900/30 border border-blue-500/30 p-4 rounded-lg">
              <p className="text-sm text-blue-200 flex items-start">
                <Mail size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                安全验证：验证码已发送至 {email}，请输入验证码以完成登录。
              </p>
            </div>

            {errorMsg && (
              <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded text-sm">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">邮箱验证码</label>
              <input
                type="text"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 text-white bg-gray-700 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm tracking-widest text-center text-lg"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-70 transition-colors shadow-lg"
            >
              {loading ? '验证中...' : '完成登录'}
            </button>
            
            <button
              type="button"
              onClick={() => { setStep(1); setPassword(''); setErrorMsg(''); }}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-300"
            >
              返回上一步
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
