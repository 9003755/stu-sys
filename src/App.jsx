import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import { SuperAuthProvider } from './contexts/SuperAuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import StudentProfile from './pages/StudentProfile'
import EnrollConfirmation from './pages/EnrollConfirmation'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRegister from './pages/admin/AdminRegister'
import SuperLogin from './pages/super/SuperLogin'
import SuperDashboard from './pages/super/SuperDashboard'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="p-4">Loading...</div>
  
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

// Home Component with Profile Check
const Home = () => {
  const { user, signOut } = useAuth()
  const [hasProfile, setHasProfile] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setHasProfile(true)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [user])

  if (loading) return <div className="p-8">检查档案状态中...</div>

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">欢迎来到学员报名系统</h1>
        {user ? (
          <div>
            <p className="mb-4 text-gray-600">当前登录: <span className="font-semibold text-gray-900">{user.email}</span></p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {!hasProfile ? (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        您的档案尚未完善，请先完善档案才能进行报名。
                      </p>
                      <p className="mt-2">
                        <Link to="/student/profile" className="font-medium text-yellow-700 underline hover:text-yellow-600">
                          立即完善档案 &rarr;
                        </Link>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border-l-4 border-green-400 p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <p className="text-sm text-green-700">
                        您的档案已建立。
                      </p>
                      <p className="mt-2">
                        <Link to="/student/profile" className="font-medium text-green-700 underline hover:text-green-600">
                          查看/编辑档案 &rarr;
                        </Link>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => signOut()}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
            >
              退出登录
            </button>
          </div>
        ) : (
          <div className="space-x-4">
            <Link to="/login" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">登录</Link>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AdminAuthProvider>
          <SuperAuthProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route 
                path="/student/profile" 
                element={
                  <ProtectedRoute>
                    <StudentProfile />
                  </ProtectedRoute>
                } 
              />
              <Route path="/enroll/:classId" element={<EnrollConfirmation />} />
              {/* Admin Routes */}
              <Route path="/admin/login" element={<Navigate to="/login?role=admin" replace />} />
              <Route path="/admin/register" element={<AdminRegister />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              
              {/* Super Admin Routes */}
              <Route path="/super/login" element={<SuperLogin />} />
              <Route path="/super/dashboard" element={<SuperDashboard />} />
            </Routes>
          </SuperAuthProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
