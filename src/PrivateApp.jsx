import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import { SuperAuthProvider } from './contexts/SuperAuthContext'
import { lazyWithRetry } from './lib/lazyWithRetry'

const Login = lazyWithRetry(() => import('./pages/Login'))
const Register = lazyWithRetry(() => import('./pages/Register'))
const StudentProfile = lazyWithRetry(() => import('./pages/StudentProfile'))
const EnrollConfirmation = lazyWithRetry(() => import('./pages/EnrollConfirmation'))
const AdminDashboard = lazyWithRetry(() => import('./pages/admin/AdminDashboard'))
const AdminRegister = lazyWithRetry(() => import('./pages/admin/AdminRegister'))
const SuperLogin = lazyWithRetry(() => import('./pages/super/SuperLogin'))
const SuperDashboard = lazyWithRetry(() => import('./pages/super/SuperDashboard'))
const AllStudents = lazyWithRetry(() => import('./pages/super/AllStudents'))
const ExcelTemplateFilterTool = lazyWithRetry(() => import('./pages/tools/ExcelTemplateFilterTool'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="p-4">Loading...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? '/student/profile' : '/login'} replace />
}

export default function PrivateApp() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <SuperAuthProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">加载中...</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/student/profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />
              <Route path="/enroll/:classId" element={<EnrollConfirmation />} />
              <Route path="/admin/login" element={<Navigate to="/login?role=admin" replace />} />
              <Route path="/admin/register" element={<AdminRegister />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/tools/excel-template-filter" element={<ExcelTemplateFilterTool />} />
              <Route path="/super/login" element={<SuperLogin />} />
              <Route path="/super/dashboard" element={<SuperDashboard />} />
              <Route path="/super/students" element={<AllStudents />} />
            </Routes>
          </Suspense>
        </SuperAuthProvider>
      </AdminAuthProvider>
    </AuthProvider>
  )
}
