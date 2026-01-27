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
import AllStudents from './pages/super/AllStudents'
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
          </SuperAuthProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
