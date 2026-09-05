import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseAdmin } from '../../lib/supabase'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import ClassManagement from './ClassManagement'
import EnrollmentManagement from './EnrollmentManagement'
import ClassDocumentManagement from './ClassDocumentManagement'

export default function AdminDashboard() {
  const { adminUser, adminSignOut, loading: authLoading } = useAdminAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('classes') // 'classes' or 'students'
  const [selectedClassId, setSelectedClassId] = useState(null) // For filtering students from class list
  const [selectedDocumentClassId, setSelectedDocumentClassId] = useState(null)
  const [adminProfile, setAdminProfile] = useState(null)

  useEffect(() => {
    // Verify admin status on mount
    const checkAdmin = async () => {
      if (authLoading) return
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
  }, [adminUser, authLoading, navigate])

  const handleLogout = async () => {
    await adminSignOut()
    navigate('/admin/login')
  }

  // Handler for viewing students from ClassManagement
  const handleViewClassStudents = (classId) => {
    setSelectedClassId(classId)
    setActiveTab('students')
  }

  const handleViewClassDocuments = (classId) => {
    setSelectedDocumentClassId(classId)
    setActiveTab('documents')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--ui-page)] text-[var(--ui-muted)] flex items-center justify-center">
        Loading...
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--ui-page)] text-[var(--ui-muted)] flex items-center justify-center">
        正在验证管理员会话...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ui-page)]">
      <nav className="border-b border-[var(--ui-border)] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--ui-primary)] text-sm font-bold text-white">
                  UAV
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--ui-title)] sm:text-lg">
                    报名系统管理后台
                  </div>
                  <div className="text-xs text-[var(--ui-muted)]">班级、报名和学员资料管理</div>
                </div>
              </div>

              {adminProfile && (
                <div className="flex items-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2">
                  <div className="mr-2 h-2 w-2 rounded-full bg-green-500"></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-[var(--ui-muted)]">当前登录</span>
                    <span className="text-sm font-medium leading-none text-[var(--ui-title)]">
                      {adminProfile.full_name || '管理员'}
                      <span className="ml-2 text-xs font-normal text-[var(--ui-muted)]">({adminUser?.email})</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('classes')}
                  className={`${activeTab === 'classes' ? 'bg-[var(--ui-primary)] text-white' : 'text-[var(--ui-muted)] hover:bg-[var(--ui-primary-soft)] hover:text-[var(--ui-primary)]'} rounded-md px-3 py-2 text-sm font-medium transition-colors`}
                >
                  班级管理
                </button>
                <button
                  onClick={() => setActiveTab('students')}
                  className={`${activeTab === 'students' ? 'bg-[var(--ui-primary)] text-white' : 'text-[var(--ui-muted)] hover:bg-[var(--ui-primary-soft)] hover:text-[var(--ui-primary)]'} rounded-md px-3 py-2 text-sm font-medium transition-colors`}
                >
                  学员列表
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`${activeTab === 'documents' ? 'bg-[var(--ui-primary)] text-white' : 'text-[var(--ui-muted)] hover:bg-[var(--ui-primary-soft)] hover:text-[var(--ui-primary)]'} rounded-md px-3 py-2 text-sm font-medium transition-colors`}
                >
                  资料收集
                </button>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-sm font-medium text-[var(--ui-muted)] transition-colors hover:bg-[var(--ui-danger-bg)] hover:text-[var(--ui-danger)]"
            >
              退出登录
            </button>
          </div>
        </div>
      </nav>

      <main>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {activeTab === 'classes' && <ClassManagement onViewStudents={handleViewClassStudents} onViewDocuments={handleViewClassDocuments} />}
          {activeTab === 'students' && <EnrollmentManagement initialClassId={selectedClassId} />}
          {activeTab === 'documents' && <ClassDocumentManagement initialClassId={selectedDocumentClassId} />}
        </div>
      </main>
    </div>
  )
}
