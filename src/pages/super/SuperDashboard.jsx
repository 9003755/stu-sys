import { useState, useEffect } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseSuper } from '../../lib/supabase'
import { buildAppUrl } from '../../lib/siteUrls'
import { useSuperAuth } from '../../contexts/SuperAuthContext'
import { Shield, UserPlus, Users, Trash2, RefreshCw, LogOut, Key, XCircle } from 'lucide-react'

export default function SuperDashboard() {
  const { superSignOut } = useSuperAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await superSignOut()
      navigate('/super/login')
    } catch (error) {
      console.error('Logout error:', error)
      // Even if API fails, force redirect
      navigate('/super/login')
    }
  }
  const adminRegisterUrl = buildAppUrl('/admin/register')
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState(null)
  
  // Create Form State
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', fullName: '' })
  
  const [expandedAdminId, setExpandedAdminId] = useState(null)
  const [adminDetails, setAdminDetails] = useState({}) // { adminId: { classes: [], enrollments: [] } }

  useEffect(() => {
    fetchAdmins()
  }, [])

  const fetchAdminDetails = async (adminId) => {
    try {
      // We will now prefer RPC 'get_admin_class_stats' to fetch details bypassing RLS
      // This is robust against RLS policy changes.
      
      const { data: realStats, error: realError } = await supabaseSuper
        .rpc('get_admin_class_stats', { target_admin_id: adminId })
        
      if (realError) {
        console.warn('RPC fetch failed', realError)
        throw realError
      }

      const classes = realStats.map(item => ({
        id: item.class_id,
        name: item.class_name
      })) || []
      
      const totalStudents = realStats.reduce((sum, item) => sum + (item.student_count || 0), 0)

      setAdminDetails(prev => ({
        ...prev,
        [adminId]: { classes, totalStudents }
      }))
    } catch (error) {
      console.error('Error fetching details:', error)
      // Set empty state so UI doesn't stick on "loading"
      setAdminDetails(prev => ({
        ...prev,
        [adminId]: { classes: [], totalStudents: 0, error: true }
      }))
    }
  }

  const toggleExpand = (adminId) => {
    if (expandedAdminId === adminId) {
      setExpandedAdminId(null)
    } else {
      setExpandedAdminId(adminId)
      if (!adminDetails[adminId]) {
        fetchAdminDetails(adminId)
      }
    }
  }

  // Password Reset State
  const [newPassword, setNewPassword] = useState('')

  const [lostData, setLostData] = useState([])
  const [zombieUsers, setZombieUsers] = useState([])
  const [selectedZombies, setSelectedZombies] = useState(new Set())
  const [showZombieModal, setShowZombieModal] = useState(false)
  
  const fetchAdmins = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabaseSuper
        .rpc('get_all_admins') 
      
      if (error) throw error
      setAdmins(data || [])
      
      // Also check for lost data
      const { data: lost, error: lostError } = await supabaseSuper
        .rpc('find_lost_super_data')
        
      if (!lostError && lost) {
         // Filter out admins that are already in the main list
         const existingEmails = new Set((data || []).map(a => a.email))
         const trulyLost = lost.filter(l => !existingEmails.has(l.user_email))
         
         if (trulyLost.length > 0) {
            setLostData(trulyLost)
         }
      }

      // Check for zombie users
      const { data: zombies, error: zombieError } = await supabaseSuper.rpc('get_zombie_users')
      if (!zombieError && zombies) {
        setZombieUsers(zombies)
      }

    } catch (error) {
      console.error('Error fetching admins:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteZombie = async (userId, email) => {
    if (!window.confirm(`确定要删除无效账号 "${email}" 吗？此操作无法撤销。`)) return

    try {
      const { error } = await supabaseSuper.rpc('delete_zombie_user', { target_user_id: userId })
      if (error) throw error

      setZombieUsers(prev => prev.filter(u => u.user_id !== userId))
      setSelectedZombies(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      alert('已删除无效账号')
    } catch (error) {
      alert('删除失败: ' + error.message)
    }
  }

  const toggleZombieSelection = (userId) => {
    setSelectedZombies(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const toggleAllZombies = () => {
    if (selectedZombies.size === zombieUsers.length) {
      setSelectedZombies(new Set())
    } else {
      setSelectedZombies(new Set(zombieUsers.map(u => u.user_id)))
    }
  }

  const handleBatchDeleteZombies = async () => {
    const count = selectedZombies.size
    if (count === 0) return

    if (!window.confirm(`确定要批量删除这 ${count} 个无效账号吗？此操作无法撤销。`)) return

    try {
      const { error } = await supabaseSuper.rpc('delete_zombie_users_batch', { 
        target_user_ids: Array.from(selectedZombies) 
      })
      
      if (error) throw error

      setZombieUsers(prev => prev.filter(u => !selectedZombies.has(u.user_id)))
      setSelectedZombies(new Set())
      alert(`成功删除 ${count} 个无效账号`)
    } catch (error) {
      alert('批量删除失败: ' + error.message)
    }
  }


  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    try {
      // Note: Client-side creation of users (admin.createUser) also requires service_role key
      // if email confirmations are disabled or specific admin settings are on.
      // But typically signUp() is public. However, we want to create a user *without logging in as them*.
      // admin.createUser() is the right way, but restricted.
      
      // Workaround for local dev/demo:
      // We will use standard signUp() but this will log us in as the new user!
      // So we must save current session, sign up, then restore session.
      // OR better: use a second temporary client instance? No, client state is shared in storage.
      
      // Since we can't use admin.createUser() from browser, and we don't want to log out super admin:
      // We'll use a fetch call to a Supabase Edge Function (if we had one).
      
      // PRACTICAL WORKAROUND for this specific environment:
      // We'll treat this as a limitation of the "Client-side only Super Admin".
      // But I can try to use the REST API directly if I had the service key exposed (unsafe).
      
      // Alternative: Just use standard signUp logic but warn that it might sign out super admin?
      // No, that's bad UX.
      
      // Let's try a clever trick:
      // We can create a temporary client instance in memory that doesn't persist session?
      // Yes!
      
      // 1. Create a temp client that doesn't persist session
      // Actually, we can just use the standard signUp logic.
      // But we need to handle the session switch.
      
      const { data: authData, error: authError } = await supabaseSuper.auth.signUp({
        email: newAdmin.email,
        password: newAdmin.password,
        options: {
          data: { full_name: newAdmin.fullName },
        }
      })
      
      if (authError) {
        if (authError.message.includes('User already registered')) {
            // User exists, but might not be in admins table.
            // Let's try to add them to admins table if they are not there.
            // But we don't know their ID unless we can look it up.
            // And we can't look it up without service key.
            // So we just alert.
            alert('创建失败：该邮箱已被注册。请检查是否已经是管理员，或者使用其他邮箱。')
            return
        }
        throw authError
      }
      
      // 2. Add to public.admins table
      if (authData.user) {
        // We use upsert to handle potential race conditions if trigger already added it
        const { error: dbError } = await supabaseSuper
          .from('admins')
          .upsert([{ 
            user_id: authData.user.id,
            full_name: newAdmin.fullName
          }], { onConflict: 'user_id' })

        if (dbError) {
             console.error('DB insert failed:', dbError)
             // Try one more time with simple insert if upsert fails for some reason
             const { error: retryError } = await supabaseSuper
                .from('admins')
                .insert([{ 
                    user_id: authData.user.id,
                    full_name: newAdmin.fullName
                }])
             
             if (retryError) {
                 console.error('Retry DB insert failed:', retryError)
                 alert('账号已创建，但在写入管理员列表时出错。请尝试重新登录超级管理员查看。')
             }
        }
      } else {
         // If email confirmation is required, user is created but not active.
         throw new Error('用户已创建需邮箱验证，暂无法添加到管理员列表')
      }
      
      // Check if session switched
      const { data: { user: currentUser } } = await supabaseSuper.auth.getUser()
      if (currentUser?.email !== 'neoyt@126.com') {
         // Session switched!
         // Force logout/redirect to allow re-login as super
         alert('管理员创建成功！\n\n注意：系统已自动登录新账号。\n请点击确定跳转至登录页，重新登录超级管理员。')
         navigate('/super/login')
         return
      }

      // Log Action
      await logAction('create_admin', `Created admin: ${newAdmin.email}`)

      alert('管理员创建成功')
      setShowCreateModal(false)
      setNewAdmin({ email: '', password: '', fullName: '' })
      fetchAdmins()
      await logAction('create_admin', `Created admin: ${newAdmin.email}`)

      alert('管理员创建成功')
      setShowCreateModal(false)
      setNewAdmin({ email: '', password: '', fullName: '' })
      fetchAdmins()
    } catch (error) {
      // Catch the "User not allowed" specifically
      if (error.message.includes('User not allowed')) {
         alert('创建失败: 浏览器端无法直接创建免验证账号 (需Service Role)。\n请尝试使用注册页面注册普通管理员，然后在此处管理。')
      } else {
         alert('创建失败: ' + error.message)
      }
    }
  }

  const handleDeleteAdmin = async (admin) => {
    if (!window.confirm(`警告：确定要删除管理员 "${admin.full_name}" 吗？\n\n此操作将级联删除该管理员名下的：\n1. 所有班级\n2. 所有学员资料\n\n且无法恢复！`)) return

    try {
      // 1. Delete from Auth (Cascade should handle public.admins via DB constraints, 
      // but we need to ensure cascading to classes/enrollments first or rely on DB cascade)
      // Ideally DB should be set with ON DELETE CASCADE.
      
      // Since client-side cannot delete users from Auth unless we use an Edge Function or RPC with Service Role.
      // We will use an RPC function 'delete_user_by_super' which we need to create.
      
      const { error: rpcError } = await supabaseSuper
        .rpc('delete_admin_by_super', { target_user_id: admin.user_id })
        
      if (rpcError) throw rpcError

      await logAction('delete_admin', `Deleted admin: ${admin.full_name} (${admin.user_id})`)
      
      alert('管理员数据已删除 (包括账号、班级和学员)')
      fetchAdmins()
    } catch (error) {
      console.error('Delete failed:', error)
      alert('删除失败: ' + error.message)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!selectedAdmin) return

    try {
      const { error } = await supabaseSuper.rpc('reset_user_password', {
        target_user_id: selectedAdmin.user_id,
        new_password: newPassword
      })
      
      if (error) throw error

      await logAction('reset_password', `Reset password for: ${selectedAdmin.full_name}`)
      
      alert('密码修改成功')
      setShowPasswordModal(false)
      setNewPassword('')
      setSelectedAdmin(null)
    } catch (error) {
      alert('修改失败: ' + error.message)
    }
  }

  const logAction = async (action, details) => {
    try {
      await supabaseSuper.from('super_audit_logs').insert([{
        action,
        details,
        operator: 'super_admin' // In real app, get current user ID
      }])
    } catch (e) {
      console.error('Audit log failed:', e)
    }
  }

  const handleRescueData = async (oldAdminId, email) => {
    // Prompt user for the target email (new owner)
    // We can default to the current super admin email or ask for input.
    // For simplicity, let's ask for input.
    
    // Debug: Check if oldAdminId is valid
    // Note: If oldAdminId is null/undefined, it means the classes have NULL admin_id in DB.
    // Our backend function now supports handling NULL if we pass NULL.
    // But let's confirm with user if they see "unknown" account.
    
    const targetEmail = prompt(`请输入要将这些班级转移给哪个管理员账号（邮箱）：\n\n注意：该账号必须已经存在于系统中。`, 'gl3@guanli.com');
    
    if (!targetEmail) return;

    try {
       // We need to use 'await' here and handle the response
       // Note: oldAdminId is the UUID of the old admin (which might be deleted from auth but exists in classes.admin_id)
       
       console.log(`Rescuing classes from ${oldAdminId} to ${targetEmail}...`)
       
       const { data, error } = await supabaseSuper.rpc('rescue_lost_classes', {
         target_old_admin_id: oldAdminId || null, // Explicitly pass null if undefined
         new_owner_email: targetEmail
       })
       
       if (error) {
         console.error('RPC Error:', error)
         throw error
       }
       
       alert(data) // "Successfully transferred X classes..."
       
       // Refresh lists immediately
       await fetchAdmins()
       
    } catch (error) {
       console.error('Rescue failed:', error)
       alert('恢复失败: ' + (error.message || error.details || '未知错误'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Shield className="text-red-500 h-8 w-8" />
            <h1 className="text-xl font-bold text-white">超级管理员控制台</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <LogOut size={18} className="mr-2" />
            安全退出
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Actions Bar */}
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold flex items-center">
            <Users className="mr-3 text-blue-400" />
            管理员管理
          </h2>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate('/super/students')}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              <Users size={16} className="mr-2" />
              学员档案查询
            </button>

            {zombieUsers.length > 0 && (
              <button 
                onClick={() => setShowZombieModal(true)}
                className="flex items-center px-3 py-1.5 text-sm bg-red-900/30 text-red-400 border border-red-800 rounded hover:bg-red-900/50 transition-colors"
              >
                <Trash2 size={14} className="mr-2" />
                发现 {zombieUsers.length} 个无效账号
              </button>
            )}
            <div className="text-sm text-gray-400 flex items-center">
               <span className="mr-2">💡 新增管理员请访问主站注册页：</span>
               <a href={adminRegisterUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                 {adminRegisterUrl}
               </a>
            </div>
          </div>
        </div>

        {/* Lost Data Section - Only show if lost data exists */}
        {lostData.length > 0 && (
          <div className="mb-8 bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-yellow-500 mb-4 flex items-center">
              <span className="mr-2">⚠️</span> 发现“遗失”的管理员数据
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
              检测到以下账号拥有班级数据，但并未出现在普通管理员列表中（可能是之前的测试账号或数据残留）。
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-gray-300">
                <thead className="border-b border-yellow-700/30 text-yellow-500/80 uppercase">
                  <tr>
                    <th className="px-4 py-2">账号 (Email)</th>
                    <th className="px-4 py-2">遗留班级数</th>
                    <th className="px-4 py-2">遗留班级名称</th>
                    <th className="px-4 py-2">遗留学员数</th>
                    <th className="px-4 py-2">操作建议</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-700/30">
                  {lostData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-yellow-900/20">
                      <td className="px-4 py-3 font-mono">{item.user_email || '未知/已删除账号'}</td>
                      <td className="px-4 py-3 text-white font-bold">{item.class_count}</td>
                      <td className="px-4 py-3 text-gray-400">{item.class_names}</td>
                      <td className="px-4 py-3 text-white font-bold">{item.student_count}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => handleRescueData(item.admin_id, item.user_email)}
                          className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded border border-yellow-500 transition-colors shadow-sm"
                        >
                          转移数据给...
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Admins List */}
        <div className="bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-750">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">管理员信息</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">账号 (Email)</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">注册时间</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {loading ? (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">加载数据中...</td></tr>
                ) : admins.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">暂无普通管理员</td></tr>
                ) : (
                  admins.map((admin) => (
                    <React.Fragment key={admin.id}>
                    <tr 
                      className={`hover:bg-gray-750 transition-colors cursor-pointer ${expandedAdminId === admin.id ? 'bg-gray-750' : ''}`}
                      onClick={() => toggleExpand(admin.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white flex items-center">
                          {expandedAdminId === admin.id ? (
                            <div className="mr-2 text-blue-400">▼</div>
                          ) : (
                            <div className="mr-2 text-gray-500">▶</div>
                          )}
                          {admin.full_name || '未命名'}
                        </div>
                        <div className="text-xs text-gray-500 ml-5">ID: {admin.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {admin.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => { setSelectedAdmin(admin); setShowPasswordModal(true); }}
                          className="text-yellow-500 hover:text-yellow-400 inline-flex items-center"
                          title="修改密码"
                        >
                          <Key size={16} className="mr-1" />
                          重置密码
                        </button>
                        <button 
                          onClick={() => handleDeleteAdmin(admin)}
                          className="text-red-500 hover:text-red-400 inline-flex items-center"
                          title="删除管理员"
                        >
                          <Trash2 size={16} className="mr-1" />
                          删除
                        </button>
                      </td>
                    </tr>
                    {expandedAdminId === admin.id && (
                      <tr className="bg-gray-800/50">
                        <td colSpan="4" className="px-6 py-4">
                          <div className="ml-5 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
                              <Users size={14} className="mr-2" />
                              数据概览
                            </h4>
                            {adminDetails[admin.id] ? (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                  <div className="text-xs text-gray-400">管理班级数</div>
                                  <div className="text-xl font-bold text-blue-400">
                                    {adminDetails[admin.id].classes.length} 个
                                  </div>
                                  <div className="mt-2 text-xs text-gray-500">
                                    {adminDetails[admin.id].classes.map(c => c.name).join(', ') || '暂无班级'}
                                  </div>
                                </div>
                                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                                  <div className="text-xs text-gray-400">总学员数</div>
                                  <div className="text-xl font-bold text-green-400">
                                    {adminDetails[admin.id].totalStudents} 人
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 animate-pulse">加载详细数据中...</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Zombie Users Modal */}
      {showZombieModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full border border-gray-700 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center">
                  <span className="mr-2">👻</span> 清理无效账号 (僵尸用户)
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  以下账号已注册但未填写任何学员档案，也非管理员。
                </p>
              </div>
              <button onClick={() => setShowZombieModal(false)} className="text-gray-400 hover:text-white">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-900/50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input 
                        type="checkbox" 
                        checked={zombieUsers.length > 0 && selectedZombies.size === zombieUsers.length}
                        onChange={toggleAllZombies}
                        className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">账号 (Email)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">注册时间</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 bg-gray-800">
                  {zombieUsers.map((user) => (
                    <tr key={user.user_id} className={`hover:bg-gray-700/50 ${selectedZombies.has(user.user_id) ? 'bg-blue-900/10' : ''}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          checked={selectedZombies.has(user.user_id)}
                          onChange={() => toggleZombieSelection(user.user_id)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleDeleteZombie(user.user_id, user.email)}
                          className="text-red-400 hover:text-red-300 border border-red-900/50 hover:bg-red-900/20 px-3 py-1 rounded transition-colors"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {zombieUsers.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                        暂无无效账号
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-between items-center">
              <div className="text-sm text-gray-400">
                已选 {selectedZombies.size} 个账号
              </div>
              <div className="space-x-3">
                <button
                  onClick={handleBatchDeleteZombies}
                  disabled={selectedZombies.size === 0}
                  className={`px-4 py-2 rounded transition-colors ${
                    selectedZombies.size > 0 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  批量删除
                </button>
                <button
                  onClick={() => setShowZombieModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg max-w-md w-full border border-gray-700 shadow-2xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6">新建管理员</h3>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">姓名</label>
                  <input
                    type="text"
                    required
                    value={newAdmin.fullName}
                    onChange={e => setNewAdmin({...newAdmin, fullName: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">邮箱账号</label>
                  <input
                    type="email"
                    required
                    value={newAdmin.email}
                    onChange={e => setNewAdmin({...newAdmin, email: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">初始密码</label>
                  <input
                    type="text"
                    required
                    value={newAdmin.password}
                    onChange={e => setNewAdmin({...newAdmin, password: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder="建议包含大小写字母+数字"
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-gray-300 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    确认创建
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedAdmin && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg max-w-md w-full border border-gray-700 shadow-2xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6">
                重置密码: {selectedAdmin.full_name}
              </h3>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">新密码</label>
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:ring-yellow-500 focus:border-yellow-500"
                    placeholder="请输入新密码"
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowPasswordModal(false); setSelectedAdmin(null); }}
                    className="px-4 py-2 text-gray-300 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                  >
                    确认修改
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
