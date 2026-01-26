import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Trash2, Plus, X, Share2, Users } from 'lucide-react'

export default function ClassManagement({ onViewStudents }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [currentClass, setCurrentClass] = useState(null)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    status: 'recruiting'
  })

  useEffect(() => {
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabaseAdmin.auth.getUser()
      if (!user) return

      const { data, error } = await supabaseAdmin
        .from('classes')
        .select('*')
        .eq('admin_id', user.id) // Filter strictly by admin_id
        .order('created_at', { ascending: false })

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
      alert('获取班级列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    // 1. Check if there are any enrollments in this class
    try {
      const { count, error: countError } = await supabaseAdmin
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', id)

      if (countError) throw countError

      if (count > 0) {
        alert(`无法删除：该班级下仍有 ${count} 位学员。请先在“学员列表”中删除所有该班级的学员，然后再尝试删除班级。`)
        return
      }
    } catch (error) {
      console.error('Error checking enrollments:', error)
      alert('检查班级学员失败，请重试')
      return
    }

    // 2. Proceed with delete
    if (!window.confirm('确定要删除这个班级吗？')) return

    try {
      const { error } = await supabaseAdmin
        .from('classes')
        .delete()
        .eq('id', id)

      if (error) throw error
      setClasses(classes.filter(c => c.id !== id))
    } catch (error) {
      console.error('Error deleting class:', error)
      alert('删除失败')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      // Get current user to set admin_id
      const { data: { user } } = await supabaseAdmin.auth.getUser()
      if (!user) throw new Error('未登录')

      const { error } = await supabaseAdmin
        .from('classes')
        .insert([{
          ...formData,
          admin_id: user.id // Explicitly set admin_id
        }])

      if (error) throw error
      
      setShowModal(false)
      setFormData({
        name: '',
        description: '',
        start_date: '',
        status: 'recruiting'
      })
      fetchClasses() // Refresh list
    } catch (error) {
      console.error('Error creating class:', error)
      alert('创建失败: ' + error.message)
    }
  }

  const openQR = (cls) => {
    setCurrentClass(cls)
    setShowQRModal(true)
  }

  // Enrollment Link
  const getEnrollLink = (classId) => {
    return `${window.location.origin}/enroll/${classId}`
  }

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">班级管理</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} className="mr-2" />
          创建新班级
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">班级名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开班日期</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {classes.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                  暂无班级，请点击右上角创建
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{cls.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{cls.start_date}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${cls.status === 'recruiting' ? 'bg-green-100 text-green-800' : 
                        cls.status === 'ongoing' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {cls.status === 'recruiting' ? '招生中' : cls.status === 'ongoing' ? '进行中' : '已结束'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                    {cls.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button onClick={() => openQR(cls)} className="text-blue-600 hover:text-blue-900" title="查看二维码">
                      <Share2 size={18} />
                    </button>
                    <button onClick={() => onViewStudents && onViewStudents(cls.id)} className="text-indigo-600 hover:text-indigo-900" title="查看学员">
                      <Users size={18} />
                    </button>
                    <button onClick={() => handleDelete(cls.id)} className="text-red-600 hover:text-red-900" title="删除班级">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Class Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold mb-6">创建新班级</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">班级名称</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如：2024春季基础班"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">开班日期</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={e => setFormData({...formData, start_date: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">班级描述</label>
                <textarea
                  rows="3"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="课程内容简介..."
                />
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && currentClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-sm w-full relative text-center">
            <button 
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold mb-2">{currentClass.name}</h3>
            <p className="text-gray-500 text-sm mb-6">扫码报名此班级</p>
            
            <div className="flex justify-center mb-6">
              <QRCodeSVG 
                value={getEnrollLink(currentClass.id)} 
                size={200}
                level={"H"}
                includeMargin={true}
              />
            </div>

            <div className="bg-gray-100 p-3 rounded text-xs break-all text-gray-500">
              {getEnrollLink(currentClass.id)}
            </div>
            
            <button
              onClick={() => window.print()}
              className="mt-6 text-blue-600 text-sm font-medium hover:underline"
            >
              打印此页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
