import { useState, useEffect } from 'react'
import { supabaseSuper } from '../lib/supabase'
import { Users, Search, Filter, Loader2, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function AllStudents() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all') // all, has_profile, no_profile

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    try {
      setLoading(true)
      
      // 1. Get all users from auth
      // Use listUsers() correctly. The response structure might vary by version.
      // Usually { data: { users: [] }, error } or { data: [], error } for older versions or rpc
      // But auth.admin.listUsers returns { data: { users: [] }, error } in recent v2
      
      const { data, error: usersError } = await supabaseSuper.auth.admin.listUsers({
        perPage: 1000 
      })
      
      if (usersError) throw usersError
      
      const users = data.users || []

      // 2. Get all admins IDs to exclude them
      const { data: admins } = await supabaseSuper.from('admins').select('user_id')
      const adminIds = new Set(admins?.map(a => a.user_id))

      // 3. Get all profiles
      const { data: profiles } = await supabaseSuper.from('profiles').select('user_id, real_name')
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.real_name]))

      // 4. Get enrollment info
      const { data: enrollments } = await supabaseSuper
        .from('enrollments')
        .select('user_id, classes(name, admins(full_name))')
      
      const enrollMap = new Map()
      enrollments?.forEach(e => {
        enrollMap.set(e.user_id, {
          className: e.classes?.name,
          adminName: e.classes?.admins?.full_name
        })
      })

      // 5. Assemble data
      const studentList = (users || [])
        .filter(u => !adminIds.has(u.id))
        .map(u => {
          const enrollInfo = enrollMap.get(u.id) || {}
          return {
            id: u.id,
            email: u.email,
            name: profileMap.get(u.id),
            has_profile: profileMap.has(u.id),
            class_name: enrollInfo.className,
            admin_name: enrollInfo.adminName,
            registered_at: u.created_at
          }
        })
        .sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at))

      setStudents(studentList)

    } catch (error) {
      console.error('Error fetching students:', error)
      alert('加载学员数据失败')
    } finally {
      setLoading(false)
    }
  }

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.class_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    if (filter === 'has_profile') return matchesSearch && student.has_profile
    if (filter === 'no_profile') return matchesSearch && !student.has_profile
    return matchesSearch
  })

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
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

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
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
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">学员账号 (Email)</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">姓名</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">班级</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">所属管理员</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">资料状态</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">注册时间</th>
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
                    <tr key={student.id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                        {student.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">
                        {student.name || '-'}
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
