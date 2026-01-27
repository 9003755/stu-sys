import { useState, useEffect } from 'react'
import { supabaseSuper } from '../../lib/supabase'
import { Users, Search, Filter, Loader2, ArrowLeft, Trash2, Eye, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'

export default function AllStudents() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all') // all, has_profile, no_profile
  const [sortConfig, setSortConfig] = useState({ key: 'registered_at', direction: 'desc' })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabaseSuper.rpc('get_all_students_overview')
      
      if (error) throw error
      setStudents(data || [])

    } catch (error) {
      console.error('Error fetching students:', error)
      alert('加载学员数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleDelete = async (studentId, email) => {
    if (!window.confirm(`⚠️ 警告：确定要强制删除学员 "${email}" 吗？\n\n这将永久删除该学员的所有资料和报名信息，且无法恢复！`)) {
      return
    }

    try {
      const { error } = await supabaseSuper.rpc('force_delete_student', { target_user_id: studentId })
      if (error) throw error

      setStudents(prev => prev.filter(s => s.student_id !== studentId))
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(studentId)
        return next
      })
      alert('学员账号及档案已强制删除')
    } catch (error) {
      console.error('Delete error:', error)
      alert('删除失败: ' + error.message)
    }
  }

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.student_id)))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return

    if (!window.confirm(`⚠️ 严重警告：确定要强制删除选中的 ${selectedIds.size} 名学员吗？\n\n这些操作不可逆，所有相关资料和报名信息将被永久删除！`)) {
      return
    }

    try {
      setLoading(true)
      const { error } = await supabaseSuper.rpc('force_delete_students_batch', { 
        target_user_ids: Array.from(selectedIds) 
      })
      
      if (error) throw error

      setStudents(prev => prev.filter(s => !selectedIds.has(s.student_id)))
      setSelectedIds(new Set())
      alert('批量删除成功')
    } catch (error) {
      console.error('Batch delete error:', error)
      alert('批量删除失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const viewDetails = async (studentId) => {
    try {
      setLoadingProfile(true)
      const { data, error } = await supabaseSuper
        .from('profiles')
        .select('*')
        .eq('user_id', studentId)
        .single()

      if (error) throw error
      if (!data) {
        alert('该学员暂无详细资料')
        return
      }

      setSelectedProfile(data)
    } catch (error) {
      console.error('Error fetching profile:', error)
      alert('无法加载学员资料')
    } finally {
      setLoadingProfile(false)
    }
  }

  const sortedStudents = [...students].sort((a, b) => {
    if (!sortConfig.key) return 0
    
    let aValue = a[sortConfig.key]
    let bValue = b[sortConfig.key]

    // Handle boolean for 'has_profile'
    if (typeof aValue === 'boolean') {
      aValue = aValue ? 1 : 0
      bValue = bValue ? 1 : 0
    }
    
    // Handle null/undefined
    if (!aValue) aValue = ''
    if (!bValue) bValue = ''

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })

  const filteredStudents = sortedStudents.filter(student => {
    const matchesSearch = 
      student.student_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.class_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    if (filter === 'has_profile') return matchesSearch && student.has_profile
    if (filter === 'no_profile') return matchesSearch && !student.has_profile
    return matchesSearch
  })

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <div className="w-4 h-4 ml-1 inline-block opacity-20">↕</div>
    return sortConfig.direction === 'asc' 
      ? <span className="ml-1 text-blue-400">↑</span> 
      : <span className="ml-1 text-blue-400">↓</span>
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      {/* Profile Detail Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative border border-gray-700">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center z-10">
              <h3 className="text-xl font-bold text-white">学员详细资料</h3>
              <button 
                onClick={() => setSelectedProfile(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-8 text-gray-300">
              {/* Basic Info */}
              <section>
                <h4 className="text-lg font-bold text-blue-400 border-l-4 border-blue-500 pl-3 mb-4">基本信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">姓名</span>
                    <span className="font-medium text-white">{selectedProfile.real_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">性别</span>
                    <span className="font-medium text-white">{selectedProfile.gender}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">出生日期</span>
                    <span className="font-medium text-white">{selectedProfile.birth_date}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">国籍</span>
                    <span className="font-medium text-white">{selectedProfile.nationality}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">民族</span>
                    <span className="font-medium text-white">{selectedProfile.ethnicity}</span>
                  </div>
                </div>
              </section>

              {/* ID Info */}
              <section>
                <h4 className="text-lg font-bold text-blue-400 border-l-4 border-blue-500 pl-3 mb-4">证件信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">证件类型</span>
                    <span className="font-medium text-white">{selectedProfile.id_type}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">证件号码</span>
                    <span className="font-medium text-white">{selectedProfile.id_number}</span>
                  </div>
                </div>
              </section>

              {/* Contact Info */}
              <section>
                <h4 className="text-lg font-bold text-blue-400 border-l-4 border-blue-500 pl-3 mb-4">联系方式</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block">联系电话</span>
                    <span className="font-medium text-white">{selectedProfile.contact_phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">邮箱</span>
                    <span className="font-medium text-white">{selectedProfile.email_contact}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">邮政编码</span>
                    <span className="font-medium text-white">{selectedProfile.postal_code}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block">所在地区</span>
                    <span className="font-medium text-white">{selectedProfile.region}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-gray-500 text-sm block">详细地址</span>
                    <span className="font-medium text-white">{selectedProfile.address}</span>
                  </div>
                </div>
              </section>

              {/* Images */}
              <section>
                <h4 className="text-lg font-bold text-blue-400 border-l-4 border-blue-500 pl-3 mb-4">证件图片</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">证件照</span>
                    {selectedProfile.photo_url ? (
                      <div className="border border-gray-600 rounded-lg overflow-hidden h-48 w-36 bg-gray-900 flex items-center justify-center">
                        <img 
                          src={selectedProfile.photo_url} 
                          alt="证件照" 
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(selectedProfile.photo_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-36 bg-gray-800 rounded flex items-center justify-center text-gray-500 text-sm border border-gray-700">未上传</div>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">身份证正面</span>
                    {selectedProfile.id_card_front_url ? (
                      <div className="border border-gray-600 rounded-lg overflow-hidden h-48 w-full bg-gray-900 flex items-center justify-center">
                        <img 
                          src={selectedProfile.id_card_front_url} 
                          alt="身份证正面" 
                          className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(selectedProfile.id_card_front_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-full bg-gray-800 rounded flex items-center justify-center text-gray-500 text-sm border border-gray-700">未上传</div>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm block mb-2">身份证反面</span>
                    {selectedProfile.id_card_back_url ? (
                      <div className="border border-gray-600 rounded-lg overflow-hidden h-48 w-full bg-gray-900 flex items-center justify-center">
                        <img 
                          src={selectedProfile.id_card_back_url} 
                          alt="身份证反面" 
                          className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(selectedProfile.id_card_back_url, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="h-48 w-full bg-gray-800 rounded flex items-center justify-center text-gray-500 text-sm border border-gray-700">未上传</div>
                    )}
                  </div>
                </div>
              </section>
            </div>
            
            <div className="border-t border-gray-700 px-6 py-4 bg-gray-800 flex justify-end">
              <button 
                onClick={() => setSelectedProfile(null)}
                className="bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-600 font-medium transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <button 
              onClick={() => navigate('/super')}
              className="flex items-center text-gray-400 hover:text-white mb-2 transition-colors"
            >
              <ArrowLeft size={20} className="mr-1" /> 返回控制台
            </button>
            <h1 className="text-3xl font-bold flex items-center">
              <Users className="mr-3 text-blue-500" />
              学员档案查询
            </h1>
            <p className="text-gray-400 mt-1 ml-1">
              共找到 {students.length} 名学员
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg mr-2"
              >
                <Trash2 size={16} className="mr-2" />
                批量删除 ({selectedIds.size})
              </button>
            )}
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="搜索邮箱、姓名、班级..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full sm:w-64"
              />
            </div>
            
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none cursor-pointer"
              >
                <option value="all">所有状态</option>
                <option value="has_profile">已填写资料</option>
                <option value="no_profile">未填写资料</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-750 bg-gray-900/50">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredStudents.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('student_email')}
                  >
                    学员账号 (Email) <SortIcon columnKey="student_email" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('student_name')}
                  >
                    姓名 <SortIcon columnKey="student_name" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('class_name')}
                  >
                    班级 <SortIcon columnKey="class_name" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('admin_name')}
                  >
                    所属管理员 <SortIcon columnKey="admin_name" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('has_profile')}
                  >
                    资料状态 <SortIcon columnKey="has_profile" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort('registered_at')}
                  >
                    注册时间 <SortIcon columnKey="registered_at" />
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin mb-2 text-blue-500" />
                        <p>正在加载数据...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      没有找到匹配的学员数据
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.student_id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                          checked={selectedIds.has(student.student_id)}
                          onChange={() => toggleSelection(student.student_id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                        <div className="flex items-center space-x-2">
                          <span>{student.student_email}</span>
                          <button 
                            onClick={() => viewDetails(student.student_id)}
                            className="text-gray-400 hover:text-blue-400 transition-colors p-1"
                            title="查看详细资料"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">
                        {student.student_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-400">
                        {student.class_name || <span className="text-gray-600 italic">未分班</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {student.admin_name || <span className="text-gray-600 italic">-</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {student.has_profile ? (
                          <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/30 text-green-400 border border-green-800">
                            已填写
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/30 text-red-400 border border-red-800">
                            未填写
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(student.registered_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(student.student_id, student.student_email)}
                          className="text-red-400 hover:text-red-300 border border-red-900/50 hover:bg-red-900/20 px-3 py-1 rounded transition-colors"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
