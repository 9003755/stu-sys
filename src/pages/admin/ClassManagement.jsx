import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabase'
import { buildAppUrl } from '../../lib/siteUrls'
import { QRCodeSVG } from 'qrcode.react'
import { Trash2, Plus, X, Share2, Users, FileUp } from 'lucide-react'

export default function ClassManagement({ onViewStudents, onViewDocuments }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [currentClass, setCurrentClass] = useState(null)
  const [collectionQr, setCollectionQr] = useState(null)
  const [documentStats, setDocumentStats] = useState({})
  
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
      const classIds = (data || []).map((item) => item.id)
      if (classIds.length) {
        const [enrollmentResult, submissionResult] = await Promise.all([
          supabaseAdmin.from('enrollments').select('id,class_id').in('class_id', classIds),
          supabaseAdmin.from('class_document_submissions').select('class_id,enrollment_id,match_status').in('class_id', classIds),
        ])
        if (!enrollmentResult.error && !submissionResult.error) {
          const next = {}
          classIds.forEach((id) => { next[id] = { total: 0, submitted: 0, pending: 0 } })
          enrollmentResult.data?.forEach((item) => { next[item.class_id].total += 1 })
          submissionResult.data?.forEach((item) => { if (item.match_status === 'matched' && item.enrollment_id) next[item.class_id].submitted += 1; if (item.match_status === 'pending') next[item.class_id].pending += 1 })
          setDocumentStats(next)
        }
      } else setDocumentStats({})
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
    return buildAppUrl(`/enroll/${classId}`)
  }

  const openCollectionQr = async (cls) => {
    try {
      const { data, error } = await supabaseAdmin.rpc('ensure_class_document_collection', { target_class_id: cls.id })
      if (error) throw error
      setCollectionQr({ className: cls.name, url: buildAppUrl(`/class-documents/${data.access_token}`) })
    } catch (error) {
      alert('无法生成资料收集二维码：' + error.message)
    }
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">资料提交</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {classes.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
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
                    {documentStats[cls.id] ? <button type="button" onClick={() => onViewDocuments?.(cls.id)} className={`text-left hover:underline ${documentStats[cls.id].pending > 0 ? 'font-semibold text-red-700' : documentStats[cls.id].submitted === documentStats[cls.id].total && documentStats[cls.id].total > 0 ? 'text-green-700' : 'text-amber-700'}`}>已交 {documentStats[cls.id].submitted}/{documentStats[cls.id].total} · 未交 {Math.max(0, documentStats[cls.id].total - documentStats[cls.id].submitted)}{documentStats[cls.id].pending > 0 ? ` · 待核对 ${documentStats[cls.id].pending}` : ''}</button> : '未启用'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                    {cls.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openQR(cls)} className="inline-flex h-9 w-9 items-center justify-center rounded border border-blue-200 text-blue-700 hover:bg-blue-50" title="班级报名二维码" aria-label="班级报名二维码">
                      <Share2 size={17} />
                    </button>
                    <button onClick={() => onViewStudents && onViewStudents(cls.id)} className="inline-flex h-9 w-9 items-center justify-center rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50" title="查看学员" aria-label="查看学员">
                      <Users size={17} />
                    </button>
                    <button onClick={() => openCollectionQr(cls)} className="inline-flex h-9 items-center gap-2 rounded bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-700" title="生成资料收集二维码">
                      <FileUp size={17} />
                      资料收集二维码
                    </button>
                    <button onClick={() => handleDelete(cls.id)} className="inline-flex h-9 w-9 items-center justify-center rounded border border-red-200 text-red-700 hover:bg-red-50" title="删除班级" aria-label="删除班级">
                      <Trash2 size={17} />
                    </button>
                    </div>
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
            <p className="text-gray-500 text-sm mb-2">扫码报名此班级</p>
            <p className="text-amber-500 text-sm font-bold mb-6">建议使用手机系统浏览器或Chrome打开</p>
            
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
      {collectionQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-xl">
            <button onClick={() => setCollectionQr(null)} className="absolute right-4 top-4 text-gray-400"><X size={24} /></button>
            <h3 className="text-xl font-bold">{collectionQr.className}</h3>
            <p className="mt-2 text-sm text-gray-600">收集学员“无犯罪记录”及“身体健康申明”</p>
            <div className="my-6 flex justify-center"><QRCodeSVG value={collectionQr.url} size={200} level="H" includeMargin /></div>
            <p className="break-all rounded bg-gray-100 p-3 text-xs text-gray-500">{collectionQr.url}</p>
            <button onClick={() => window.print()} className="mt-5 text-sm font-medium text-blue-600">打印此二维码</button>
          </div>
        </div>
      )}
    </div>
  )
}
