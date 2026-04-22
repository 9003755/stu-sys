import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import StudentProfile from './StudentProfile'

const getEnrollCacheKey = (classId, userId = 'guest') => `enroll_confirmation_cache_${classId}_${userId}`

const readEnrollCache = (classId, userId) => {
  if (typeof sessionStorage === 'undefined') return null

  try {
    const raw = sessionStorage.getItem(getEnrollCacheKey(classId, userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeEnrollCache = (classId, userId, payload) => {
  if (!classId || !userId || typeof sessionStorage === 'undefined') return

  sessionStorage.setItem(
    getEnrollCacheKey(classId, userId),
    JSON.stringify({
      ...payload,
      updatedAt: Date.now()
    })
  )
}

const clearEnrollCache = (classId, userId) => {
  if (!classId || !userId || typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(getEnrollCacheKey(classId, userId))
}

export default function EnrollConfirmation() {
  const { classId } = useParams()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const cachedState = readEnrollCache(classId, user?.id)
  
  const [classInfo, setClassInfo] = useState(cachedState?.classInfo ?? null)
  const [loading, setLoading] = useState(!cachedState)
  const [enrollStatus, setEnrollStatus] = useState(cachedState?.enrollStatus ?? 'checking') // checking, can_enroll, already_enrolled, success, error, no_profile
  const [profileId, setProfileId] = useState(cachedState?.profileId ?? null)
  const [msg, setMsg] = useState('')

  // Auth State
  const [authMode, setAuthMode] = useState('register') // Default to register for new users
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const { signIn, signUp } = useAuth()

  useEffect(() => {
    const checkStatus = async () => {
      try {
        if (!cachedState) {
          setLoading(true)
        }
        
        // 1. Get Class Info
        const { data: cls, error: clsError } = await supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .single()
        
        if (clsError) throw new Error('班级不存在')
        setClassInfo(cls)

        if (!user) {
          clearEnrollCache(classId, 'guest')
          setLoading(false)
          return
        }

        // 2. Check Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (!profile) {
          // Changed: If no profile, we stay in 'no_profile' state which will render the form
          setEnrollStatus('no_profile')
          writeEnrollCache(classId, user.id, {
            classInfo: cls,
            enrollStatus: 'no_profile',
            profileId: null
          })
          setLoading(false)
          return
        }
        setProfileId(profile.id)

        // 3. Check if already enrolled
        const { data: existing, error: enrollError } = await supabase
          .from('enrollments')
          .select('*')
          .eq('user_id', user.id)
          .eq('class_id', classId)
          .single()

        if (existing) {
          setEnrollStatus('already_enrolled')
          writeEnrollCache(classId, user.id, {
            classInfo: cls,
            enrollStatus: 'already_enrolled',
            profileId: profile.id
          })
        } else {
          setEnrollStatus('ready_to_enroll')
          writeEnrollCache(classId, user.id, {
            classInfo: cls,
            enrollStatus: 'ready_to_enroll',
            profileId: profile.id
          })
        }

      } catch (error) {
        console.error('Check status error:', error)
        setMsg(error.message)
        setEnrollStatus('error')
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [user, classId])

  const handleEnroll = async () => {
    try {
      setLoading(true)
      
      const { error } = await supabase
        .from('enrollments')
        .insert([{
          user_id: user.id,
          class_id: classId,
          profile_id: profileId,
          status: 'pending'
        }])

      if (error) throw error
      
      setEnrollStatus('success')
      writeEnrollCache(classId, user.id, {
        classInfo,
        enrollStatus: 'success',
        profileId
      })
    } catch (error) {
      console.error('Enroll error:', error)
      setMsg('报名失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }


  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setMsg('')
    try {
      if (authMode === 'login') {
        const { error } = await signIn(authEmail, authPassword)
        if (error) throw error
      } else {
        const { error } = await signUp(authEmail, authPassword)
        if (error) throw error
        // Auto login is handled by Supabase if confirm email is off, 
        // or we might need to explicit login if session not set automatically.
        // Usually signUp returns session if auto-confirm is on.
        // If not, we try to sign in.
        const { error: loginError } = await signIn(authEmail, authPassword)
        if (loginError) throw loginError
      }
      // Auth state change will trigger useEffect re-run
    } catch (error) {
      console.error('Auth error:', error)
      setMsg(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              {authMode === 'login' ? '登录以继续报名' : '注册账号以报名'}
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              您正在报名班级：<span className="font-medium text-blue-600">{classInfo ? classInfo.name : '加载中...'}</span>
            </p>
          </div>

          {msg && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {msg}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入邮箱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入密码"
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {authLoading ? '处理中...' : (authMode === 'login' ? '登录' : '注册并登录')}
            </button>
          </form>

          <div className="mt-4 text-center text-sm">
            {authMode === 'login' ? (
              <p>
                还没有账号？
                <button 
                  onClick={() => setAuthMode('register')}
                  className="text-blue-600 hover:underline ml-1 font-medium"
                >
                  立即注册
                </button>
              </p>
            ) : (
              <p>
                已有账号？
                <button 
                  onClick={() => setAuthMode('login')}
                  className="text-blue-600 hover:underline ml-1 font-medium"
                >
                  直接登录
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">加载中...</div>

  // Show Student Profile Form if logged in but not enrolled (or no profile)
  // We need to pass a callback to force refresh the status when enrollment is done
  const handleProfileSuccess = () => {
    setLoading(true)
    setEnrollStatus('success') // Directly set success status to show success view
    if (user) {
      writeEnrollCache(classId, user.id, {
        classInfo,
        enrollStatus: 'success',
        profileId
      })
    }
    setLoading(false)
  }

  if (enrollStatus === 'no_profile' || enrollStatus === 'can_enroll' || enrollStatus === 'ready_to_enroll') {
    return <StudentProfile classId={classId} onSuccess={handleProfileSuccess} />
  }

  // Handle Logout Logic
  const handleFinishAndLogout = async () => {
    try {
      setLoading(true)
      // 1. Sign out from Supabase (Student client)
      // This will only clear the student session from localStorage
      await signOut()
      clearEnrollCache(classId, user?.id)
      
      // 2. Force reload to clear React state
      window.location.reload()
    } catch (error) {
      console.error('Logout error:', error)
      // Even if error, try to reload
      window.location.reload()
    }
  }

  if (enrollStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-green-600">报名成功！</h2>
          <p className="text-gray-500 mb-6">您已成功提交报名申请，请等待管理员审核。</p>
          <button 
            onClick={handleFinishAndLogout}
            className="block w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors font-medium"
          >
            完成并退出
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-blue-600 px-6 py-4">
          <h1 className="text-xl font-bold text-white text-center">确认报名信息</h1>
        </div>
        
        <div className="p-8">
          {classInfo && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{classInfo.name}</h2>
              <div className="flex items-center text-sm text-gray-500 mb-4">
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs mr-2">
                  {classInfo.status === 'recruiting' ? '招生中' : classInfo.status}
                </span>
                <span>开班日期: {classInfo.start_date}</span>
              </div>
              <p className="text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-100">
                {classInfo.description || '暂无描述'}
              </p>
            </div>
          )}

          {msg && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {msg}
            </div>
          )}

          {enrollStatus === 'already_enrolled' ? (
            <div className="text-center">
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg mb-4">
                <p className="font-bold mb-1">您已经报名过这个班级了</p>
                <p className="text-xs opacity-75">当前账号: {user.email}</p>
              </div>
              <div className="space-y-3">
                <Link to="/" className="block w-full bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200">
                  返回首页
                </Link>
                <button 
                  onClick={handleFinishAndLogout}
                  className="block w-full border border-red-200 text-red-600 bg-white py-2 rounded hover:bg-red-50 text-sm"
                >
                  并非本人？切换账号/重新报名
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              确认报名
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
