import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseAdmin } from '../../lib/supabase'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import ClassManagement from './ClassManagement'
import EnrollmentManagement from './EnrollmentManagement'

export default function AdminDashboard() {
  const { adminUser, adminSignOut } = useAdminAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('classes') // 'classes' or 'students'
  const [selectedClassId, setSelectedClassId] = useState(null) // For filtering students from class list
  const [adminProfile, setAdminProfile] = useState(null)

  useEffect(() => {
    // Verify admin status on mount
    const checkAdmin = async () => {
      if (!adminUser) {
        navigate('/admin/login')
        return
      }

      const { data, error } = await supabaseAdmin
        .from('admins')
        .select('*')
        .eq('user_id', adminUser.id)
        .single()

      if (error || !data) {
        navigate('/') // Kick non-admins back to home
      } else {
        setAdminProfile(data)
        setLoading(false)
      }
    }
    checkAdmin()
  }, [adminUser, navigate])

  const handleLogout = async () => {
    await adminSignOut()
    navigate('/admin/login')
  }

  // Handler for viewing students from ClassManagement
  const handleViewClassStudents = (classId) => {
    setSelectedClassId(classId)
    setActiveTab('students')
  }

  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 text-white font-bold text-xl mr-8">
                报名系统管理后台
              </div>
              
              {/* Admin Info Badge */}
              {adminProfile && (
                <div className="flex items-center bg-gray-900 rounded-full px-4 py-1.5 mr-6 border border-gray-700">
                  <div className="h-2 w-2 rounded-full bg-green-400 mr-2 animate-pulse"></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">当前登录</span>
                    <span className="text-sm font-medium text-white leading-none">
                      {adminProfile.full_name || '管理员'} 
                      <span className="text-gray-500 ml-2 font-normal text-xs">({adminUser?.email})</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="hidden md:block">
                <div className="ml-10 flex items-baseline space-x-4">
                  <button 
                    onClick={() => setActiveTab('classes')}
                    className={`${activeTab === 'classes' ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'} px-3 py-2 rounded-md text-sm font-medium`}
                  >
                    班级管理
                  </button>
                  <button 
                    onClick={() => setActiveTab('students')}
                    className={`${activeTab === 'students' ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'} px-3 py-2 rounded-md text-sm font-medium`}
                  >
                    学员列表
                  </button>
                </div>
              </div>
            </div>
            <div>
              <button 
                onClick={handleLogout}
                className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {activeTab === 'classes' ? (
              <ClassManagement onViewStudents={handleViewClassStudents} />
            ) : (
              <EnrollmentManagement initialClassId={selectedClassId} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
