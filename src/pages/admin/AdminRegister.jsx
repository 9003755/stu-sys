import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseAdmin } from '../../lib/supabase'
import { useForm } from 'react-hook-form'
import { UserPlus, Shield } from 'lucide-react'

export default function AdminRegister() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors }, watch } = useForm()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const onSubmit = async (data) => {
    setLoading(true)
    setErrorMsg('')
    
    try {
      // 1. Sign up the user (this will create auth.users record)
      const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.fullName }
        }
      })

      if (authError) throw authError

      if (authData.user) {
        // 2. Insert into public.admins table
        // We use upsert to prevent unique constraint errors if the trigger already inserted it
        // Note: We need to handle potential permission issues if RLS is strict.
        
        try {
          const { error: dbError } = await supabaseAdmin
            .from('admins')
            .upsert([{ 
              user_id: authData.user.id,
              full_name: data.fullName
            }], { onConflict: 'user_id' })

          if (dbError) {
            console.error('DB insert error:', dbError)
            // If the error is about schema cache or internal issues, we might still be fine if trigger worked.
            // But usually this means RLS violation or schema mismatch.
            // Let's assume if this fails, we alert the user but don't block fully if auth succeeded.
            // But for 'admins' table, it's critical.
            throw new Error('写入管理员资料失败: ' + dbError.message)
          }
        } catch (dbErr) {
           // If the error is specifically "Could not find the 'full_name' column", 
           // it means our local schema definition in code doesn't match DB?
           // No, 'full_name' column definitely exists in our migrations.
           // It might be a Supabase client caching issue.
           console.error('DB Operation Failed:', dbErr)
           
           // Fallback: If upsert failed, maybe try simple insert?
           // Or maybe just proceed and hope the trigger handled it?
           // If we have a trigger, we don't need this manual insert!
           // BUT we haven't implemented the trigger yet in this session (I proposed it but user chose to switch to registration page).
           
           // So we MUST insert here.
           throw dbErr
        }

        alert('管理员注册成功！请使用新账号登录。')
        // Sign out to force re-login (optional, but cleaner)
        await supabaseAdmin.auth.signOut()
        navigate('/login?role=admin')
      } else {
        throw new Error('注册后未返回用户信息，可能需要邮箱验证。')
      }

    } catch (error) {
      console.error('Registration error:', error)
      setErrorMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-blue-600 mb-4" />
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            普通管理员注册
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            创建新的管理员账号以管理班级和学员
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">
              {errorMsg}
            </div>
          )}
          
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                type="text"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="请输入您的真实姓名"
                {...register("fullName", { required: "姓名不能为空" })}
              />
              {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱地址</label>
              <input
                type="email"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="作为登录账号"
                {...register("email", { 
                  required: "邮箱不能为空",
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "无效的邮箱地址"
                  }
                })}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">设置密码</label>
              <input
                type="password"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="至少6位"
                {...register("password", { 
                  required: "密码不能为空",
                  minLength: { value: 6, message: "密码至少6位" }
                })}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
              <input
                type="password"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="再次输入密码"
                {...register("confirmPassword", { 
                  validate: (val) => {
                    if (watch('password') != val) {
                      return "两次输入的密码不一致";
                    }
                  }
                })}
              />
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 transition-colors shadow-sm"
            >
              <UserPlus size={18} className="mr-2" />
              {loading ? '注册中...' : '立即注册'}
            </button>
          </div>
          
          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/login?role=admin')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              已有账号？返回登录
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
