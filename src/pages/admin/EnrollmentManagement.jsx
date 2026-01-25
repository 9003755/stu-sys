import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabase'
import { Check, X, Search, Filter, Eye, Trash2 } from 'lucide-react'

export default function EnrollmentManagement({ initialClassId = null }) {
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all') // all, pending, approved, rejected
  const [classFilter, setClassFilter] = useState(initialClassId || 'all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchClasses()
    fetchEnrollments()
  }, [])

  useEffect(() => {
    if (initialClassId) {
      setClassFilter(initialClassId)
    }
  }, [initialClassId])

  const fetchClasses = async () => {
    const { data } = await supabaseAdmin.from('classes').select('id, name')
    if (data) setClasses(data)
  }

  const fetchEnrollments = async () => {
    try {
      setLoading(true)
      const { data: enrollmentsData, error } = await supabaseAdmin
        .from('enrollments')
        .select(`
          id,
          status,
          created_at,
          class_id,
          profile_id,
          user_id,
          classes (
            id,
            name
          ),
          profiles (
            id,
            real_name,
            gender,
            contact_phone,
            id_number,
            email_contact,
            birth_date,
            nationality,
            ethnicity,
            id_type,
            postal_code,
            region,
            address_detail,
            emergency_contact,
            emergency_phone,
            photo_url,
            id_card_front_url,
            id_card_back_url
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Use the RPC function to get real auth emails
      let enrollmentsWithEmail = enrollmentsData || []
      const userIds = enrollmentsWithEmail.map(e => e.user_id)
      
      if (userIds.length > 0) {
        const { data: userEmails, error: rpcError } = await supabaseAdmin
          .rpc('get_user_emails', { user_ids: userIds })
          
        if (!rpcError && userEmails) {
          const emailMap = {}
          userEmails.forEach(item => {
             emailMap[item.user_id] = item.email
          })
          
          enrollmentsWithEmail = enrollmentsWithEmail.map(e => ({
            ...e,
            user_email: emailMap[e.user_id] || e.profiles?.email_contact || '未知账号'
          }))
        } else {
           console.error('RPC Error:', rpcError)
           // Fallback
           enrollmentsWithEmail = enrollmentsWithEmail.map(e => ({
            ...e,
            user_email: e.profiles?.email_contact || '无联系邮箱'
          }))
        }
      }

      setEnrollments(enrollmentsWithEmail)
    } catch (error) {
      console.error('Error fetching enrollments:', error)
      alert('获取报名列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabaseAdmin
        .from('enrollments')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error

      // Update local state
      setEnrollments(enrollments.map(e => 
        e.id === id ? { ...e, status: newStatus } : e
      ))
    } catch (error) {
      console.error('Error updating status:', error)
      alert('更新状态失败')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条学员记录吗？此操作无法撤销。')) return

    try {
      const { error } = await supabaseAdmin
        .from('enrollments')
        .delete()
        .eq('id', id)

      if (error) throw error

      setEnrollments(enrollments.filter(e => e.id !== id))
      
      // Remove from selection if selected
      if (selectedIds.has(id)) {
        const newSelected = new Set(selectedIds)
        newSelected.delete(id)
        setSelectedIds(newSelected)
      }
    } catch (error) {
      console.error('Error deleting enrollment:', error)
      alert('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 位学员吗？此操作无法撤销。`)) return

    try {
      const idsToDelete = Array.from(selectedIds)
      const { error } = await supabaseAdmin
        .from('enrollments')
        .delete()
        .in('id', idsToDelete)

      if (error) throw error

      setEnrollments(enrollments.filter(e => !selectedIds.has(e.id)))
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Error batch deleting:', error)
      alert('批量删除失败')
    }
  }

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = (filtered) => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(e => e.id)))
    }
  }


  // Filter Logic
  const filteredEnrollments = enrollments.filter(enrollment => {
    // 1. Status Filter
    if (statusFilter !== 'all' && enrollment.status !== statusFilter) return false
    
    // 2. Class Filter
    if (classFilter !== 'all' && enrollment.class_id !== classFilter) return false

    // 3. Search Query (Name, Phone, ID)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const profile = enrollment.profiles
      if (!profile) return false // Should not happen usually
      
      return (
        (profile.real_name && profile.real_name.toLowerCase().includes(query)) ||
        (profile.contact_phone && profile.contact_phone.includes(query)) ||
        (profile.id_number && profile.id_number.includes(query))
      )
    }

    return true
  })

  const [selectedProfile, setSelectedProfile] = useState(null)

  // View Details Modal
  const viewDetails = (profile) => {
    setSelectedProfile(profile)
  }

  if (loading && enrollments.length === 0) return <div className="p-8 text-center text-gray-500">加载中...</div>

  return (
    <div className="bg-white shadow rounded-lg p-6">
      {/* Student Detail Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
              <h3 className="text-xl font-bold text-gray-800">学员详细资料</h3>
              <button 
                onClick={() => setSelectedProfile(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Basic Info */}
              <section>
                <h4 className="text-lg font-bold text-gray-800 border-l-4 border-blue-600 pl-3 mb-4">基本信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">姓名</span>
                    <span className="font-medium">{selectedProfile.real_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">性别</span>
                    <span className="font-medium">{selectedProfile.gender}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">出生日期</span>
                    <span className="font-medium">{selectedProfile.birth_date}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">国籍</span>
                    <span className="font-medium">{selectedProfile.nationality}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">民族</span>
                    <span className="font-medium">{selectedProfile.ethnicity}</span>
                  </div>
                </div>
              </section>

              {/* ID Info */}
              <section>
                <h4 className="text-lg font-bold text-gray-800 border-l-4 border-blue-600 pl-3 mb-4">证件信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">证件类型</span>
                    <span className="font-medium">{selectedProfile.id_type}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">证件号码</span>
                    <span className="font-medium">{selectedProfile.id_number}</span>
                  </div>
                </div>
              </section>

              {/* Contact Info */}
              <section>
                <h4 className="text-lg font-bold text-gray-800 border-l-4 border-blue-600 pl-3 mb-4">联系方式</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">联系电话</span>
                    <span className="font-medium">{selectedProfile.contact_phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">邮箱</span>
                    <span className="font-medium">{selectedProfile.email_contact}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">邮政编码</span>
                    <span className="font-medium">{selectedProfile.postal_code}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">所在地区</span>
                    <span className="font-medium">{selectedProfile.region}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-gray-500 text-sm block">详细地址</span>
                    <span className="font-medium">{selectedProfile.address_detail}</span>
                  </div>
                  {/* Emergency Contact (if available) */}
                  {(selectedProfile.emergency_contact || selectedProfile.emergency_phone) && (
                    <>
                      <div>
                        <span className="text-gray-500 text-sm block">紧急联系人</span>
                        <span className="font-medium">{selectedProfile.emergency_contact || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-sm block">紧急联系电话</span>
                        <span className="font-medium">{selectedProfile.emergency_phone || '-'}</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Photos */}
              <section>
                <h4 className="text-lg font-bold text-gray-800 border-l-4 border-blue-600 pl-3 mb-4">资料照片</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">一寸白底证件照</span>
                    {selectedProfile.photo_url ? (
                      <div className="border rounded-lg overflow-hidden h-48 w-36 bg-gray-50 flex items-center justify-center">
                        <img 
                          src={selectedProfile.photo_url} 
                          alt="证件照" 
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                          onClick={() => window.open(selectedProfile.photo_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-36 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">未上传</div>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">身份证正面</span>
                    {selectedProfile.id_card_front_url ? (
                      <div className="border rounded-lg overflow-hidden h-48 w-full bg-gray-50 flex items-center justify-center">
                        <img 
                          src={selectedProfile.id_card_front_url} 
                          alt="身份证正面" 
                          className="w-full h-full object-contain cursor-pointer hover:opacity-90"
                          onClick={() => window.open(selectedProfile.id_card_front_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-full bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">未上传</div>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">身份证反面</span>
                    {selectedProfile.id_card_back_url ? (
                      <div className="border rounded-lg overflow-hidden h-48 w-full bg-gray-50 flex items-center justify-center">
                        <img 
                          src={selectedProfile.id_card_back_url} 
                          alt="身份证反面" 
                          className="w-full h-full object-contain cursor-pointer hover:opacity-90"
                          onClick={() => window.open(selectedProfile.id_card_back_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-full bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">未上传</div>
                    )}
                  </div>
                </div>
              </section>
            </div>
            
            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setSelectedProfile(null)}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-xl font-bold text-gray-800">学员报名管理</h2>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索姓名/电话/身份证..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-full md:w-64"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          </div>

          {/* Class Filter */}
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">所有班级</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">所有状态</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
          
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="flex items-center px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm border border-red-200"
            >
              <Trash2 size={14} className="mr-1" />
              批量删除 ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={filteredEnrollments.length > 0 && selectedIds.size === filteredEnrollments.length}
                  onChange={() => toggleSelectAll(filteredEnrollments)}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">学员姓名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">学员账号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申请班级</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系方式</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申请时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEnrollments.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-6 py-10 text-center text-gray-500">
                  没有找到符合条件的记录
                </td>
              </tr>
            ) : (
              filteredEnrollments.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelection(item.id)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">
                        {item.profiles?.real_name || '未完善信息'}
                      </div>
                      <button 
                        onClick={() => viewDetails(item.profiles)}
                        className="ml-2 text-gray-400 hover:text-blue-600"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">{item.profiles?.gender}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{item.user_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{item.classes?.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{item.profiles?.contact_phone}</div>
                    <div className="text-xs text-gray-500">{item.profiles?.email_contact}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${item.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                        item.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                      {item.status === 'approved' ? '已通过' : 
                       item.status === 'pending' ? '待审核' : 
                       item.status === 'rejected' ? '已拒绝' : item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {item.status === 'pending' && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(item.id, 'approved')}
                          className="text-green-600 hover:text-green-900 bg-green-50 px-2 py-1 rounded border border-green-200"
                        >
                          通过
                        </button>
                        <button 
                          onClick={() => handleStatusChange(item.id, 'rejected')}
                          className="text-red-600 hover:text-red-900 bg-red-50 px-2 py-1 rounded border border-red-200"
                        >
                          拒绝
                        </button>
                      </>
                    )}
                    {item.status !== 'pending' && (
                      <span className="text-gray-400 text-xs">已处理</span>
                    )}
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="text-red-500 hover:text-red-700 ml-2"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
