import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import { SuperAuthProvider } from './contexts/SuperAuthContext'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const StudentProfile = lazy(() => import('./pages/StudentProfile'))
const EnrollConfirmation = lazy(() => import('./pages/EnrollConfirmation'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminRegister = lazy(() => import('./pages/admin/AdminRegister'))
const SuperLogin = lazy(() => import('./pages/super/SuperLogin'))
const SuperDashboard = lazy(() => import('./pages/super/SuperDashboard'))
const AllStudents = lazy(() => import('./pages/super/AllStudents'))

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
  const { user } = useAuth()
  
  // If user is already logged in, redirect to profile or dashboard based on role?
  // But here we assume student role for root path.
  // If user is logged in, show profile. If not, redirect to login.
  
  if (user) {
    return <Navigate to="/student/profile" replace />
  }

  return <Navigate to="/login" replace />
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AdminAuthProvider>
          <SuperAuthProvider>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">加载中...</div>}>
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
                <Route path="/super/students" element={<AllStudents />} />
              </Routes>
            </Suspense>
          </SuperAuthProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
