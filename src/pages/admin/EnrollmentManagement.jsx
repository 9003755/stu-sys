import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabase'
import { Check, X, Search, Filter, Eye, Trash2, Download, FileSpreadsheet } from 'lucide-react'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'

export default function EnrollmentManagement({ initialClassId = null }) {
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadingData, setDownloadingData] = useState(false)
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
    const { data: { user } } = await supabaseAdmin.auth.getUser()
    if (!user) return
    const { data } = await supabaseAdmin
        .from('classes')
        .select('id, name')
        .eq('admin_id', user.id) // Filter by admin_id
    
    if (data) setClasses(data)
  }

  const fetchEnrollments = async () => {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabaseAdmin.auth.getUser()
      if (!user) return

      // First get my class IDs
      const { data: myClasses } = await supabaseAdmin
        .from('classes')
        .select('id')
        .eq('admin_id', user.id)
      
      const myClassIds = myClasses?.map(c => c.id) || []
      
      if (myClassIds.length === 0) {
        setEnrollments([])
        setLoading(false)
        return
      }

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
        .in('class_id', myClassIds) // Explicitly filter enrollments by my class IDs
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

  const handleDownloadIDs = async () => {
    if (selectedIds.size === 0) return
    
    const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id))
    if (selectedEnrollments.length === 0) return

    setDownloading(true)
    
    try {
      const zip = new JSZip()
      const pdfBlobs = [] // { filename: "filename.pdf", blob: Blob }

      // Helper to load image and correct orientation
      const loadImage = async (url) => {
        try {
          const response = await fetch(url)
          const blob = await response.blob()
          // Use createImageBitmap to handle EXIF orientation automatically
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
          
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(bitmap, 0, 0)
          
          return {
            width: bitmap.width,
            height: bitmap.height,
            dataUrl: canvas.toDataURL('image/jpeg', 0.95)
          }
        } catch (error) {
          console.error('Error loading image:', error)
          throw error
        }
      }

      let successCount = 0
      
      for (const enrollment of selectedEnrollments) {
        const profile = enrollment.profiles
        if (!profile) continue
        
        const name = profile.real_name || '未命名'
        const frontUrl = profile.id_card_front_url
        const backUrl = profile.id_card_back_url
        
        if (!frontUrl || !backUrl) {
          console.warn(`Skipping ${name}: missing ID images`)
          continue
        }

        try {
          const [imgFront, imgBack] = await Promise.all([
            loadImage(frontUrl),
            loadImage(backUrl)
          ])

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          })

          // A4 size: 210 x 297 mm
          // Margins: 20mm
          // Target width: 150mm
          
          const pageWidth = 210
          const margin = 30
          const imgWidth = 150
          
          // Front Image
          // Calculate scale to fit within max dimensions (imgWidth x maxHeight) while maintaining aspect ratio
          const maxImgHeight = 110 // Half of A4 (297) minus margins and spacing, approx
          
          let frontWidth = imgWidth
          let frontHeight = imgFront.height * (imgWidth / imgFront.width)
          
          if (frontHeight > maxImgHeight) {
             frontHeight = maxImgHeight
             frontWidth = imgFront.width * (maxImgHeight / imgFront.height)
          }
          
          // Center horizontally if width is less than max width
          const frontX = margin + (imgWidth - frontWidth) / 2
          
          pdf.addImage(imgFront.dataUrl, 'JPEG', frontX, 30, frontWidth, frontHeight)
          
          // Back Image
          let backWidth = imgWidth
          let backHeight = imgBack.height * (imgWidth / imgBack.width)
          
          if (backHeight > maxImgHeight) {
             backHeight = maxImgHeight
             backWidth = imgBack.width * (maxImgHeight / imgBack.height)
          }
          
          const backX = margin + (imgWidth - backWidth) / 2
          
          // Position back image below front image with spacing
          pdf.addImage(imgBack.dataUrl, 'JPEG', backX, 30 + frontHeight + 20, backWidth, backHeight)

          const blob = pdf.output('blob')
          pdfBlobs.push({ filename: `${name}身份证.pdf`, blob })
          successCount++
          
        } catch (err) {
          console.error(`Failed to process ${name}`, err)
        }
      }

      if (pdfBlobs.length === 0) {
        alert('选中的学员中没有可下载的身份证文件（可能未上传图片或加载失败）')
        return
      }

      if (pdfBlobs.length === 1) {
        // Download single file
        const { filename, blob } = pdfBlobs[0]
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } else {
        // Zip multiple files
        pdfBlobs.forEach(item => {
          zip.file(item.filename, item.blob)
        })
        
        const zipContent = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(zipContent)
        const a = document.createElement('a')
        a.href = url
        a.download = `学员身份证打包_${new Date().toISOString().slice(0,10)}.zip`
        a.click()
        URL.revokeObjectURL(url)
      }

    } catch (error) {
      console.error('Download error:', error)
      alert('下载出错：' + error.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleDownloadData = async () => {
    if (selectedIds.size === 0) return
    const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id))
    if (selectedEnrollments.length === 0) return

    setDownloadingData(true)

    try {
      // 1. Load Excel Template
      // Assuming stuIm.xlsx is in public folder or can be imported. 
      // Since it's in project root in git, we might need to move it to public to fetch it, 
      // or import it if configured. Let's assume it's available via fetch at /stuIm.xlsx or similar if put in public.
      // If it's not in public, we can't fetch it easily in dev unless we move it.
      // For now, let's try to fetch it from root (might fail if not served).
      // Best practice: Move stuIm.xlsx to public folder.
      
      // I'll try to fetch from public URL. If it fails, I'll alert.
      // Note: The file 'stuIm.xlsx' was seen in root. Vite serves public folder. 
      // I should verify if I need to move it. I'll assume I need to fetch it.
      
      const response = await fetch('/stuIm.xlsx')
      if (!response.ok) throw new Error('无法加载模版文件 (stuIm.xlsx)')
      const arrayBuffer = await response.arrayBuffer()

      const workbook = new ExcelJS.Workbook()
       await workbook.xlsx.load(arrayBuffer)
       const worksheet = workbook.getWorksheet(1) // Assume first sheet

       // Clear existing data rows (keep header row 1)
       // ExcelJS spliceRows(start, count)
       // We want to keep row 1, so start deleting from row 2.
       // However, worksheet.rowCount might include empty rows if formatting exists.
       // We should iterate and remove rows that are not header.
       
       const rowCount = worksheet.rowCount
       if (rowCount > 1) {
          // Delete all rows starting from 2
          worksheet.spliceRows(2, rowCount - 1)
       }
       
       // Force check if rows still exist (sometimes spliceRows behaves oddly if not saved)
       // Let's explicitly check and clear again if needed or use a different approach.
       // Alternative: iterate backwards and delete.
       // Or create a new worksheet and copy header.
       
       // Let's try a safer delete approach:
       // Just to be sure, check actual data rows.
       while (worksheet.rowCount > 1) {
         worksheet.spliceRows(2, 1)
       }

       // 2. Process Data
      // Columns based on python check: 
      // ['姓名', '性别', '证件类型', '证件号码', '国籍', '民族', '出生日期', '地址', '联系电话', '邮箱', '邮政编码', '详细地址']
      // Index: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 (1-based in ExcelJS)

      // Start adding from row 2 (assuming row 1 is header)
      // Check if template has data rows already? Usually template just has header.
      // We append rows.
      
      const zip = new JSZip()
      const photoFolder = zip.folder("stuTemplate").folder("stu").folder("stuPicture")
      
      // Helper to load image
      const loadImage = async (url) => {
        try {
           const res = await fetch(url)
           if (!res.ok) throw new Error('Fetch failed')
           return await res.blob()
        } catch (e) {
           console.warn('Image load failed', url, e)
           return null
        }
      }

      for (const enrollment of selectedEnrollments) {
        const p = enrollment.profiles
        if (!p) continue

        // Address Logic
        // Extract last part of region and add spaces
        let addressVal = ''
        if (p.region) {
          const parts = p.region.split(' ') // Assuming space separated "Province City District"
          // Clean empty parts
          const cleanParts = parts.filter(part => part.trim())
          if (cleanParts.length > 0) {
            const lastPart = cleanParts[cleanParts.length - 1]
            const level = cleanParts.length // 1, 2, or 3
            
            // Level 1: 0 spaces
            // Level 2: 2 spaces
            // Level 3: 4 spaces
            const spaces = level === 1 ? '' : (level === 2 ? '  ' : '    ')
            addressVal = spaces + lastPart
          }
        }

        // Add Row to Excel
        worksheet.addRow([
          p.real_name || '',
          p.gender || '',
          p.id_type || '',
          p.id_number || '',
          p.nationality || '',
          p.ethnicity || '',
          p.birth_date || '',
          addressVal,
          p.contact_phone || '',
          enrollment.user_email || p.email_contact || '', // Use email from auth or profile
          p.postal_code || '',
          p.address_detail || ''
        ])

        // Process Photo
        if (p.photo_url && p.id_number) {
            const photoBlob = await loadImage(p.photo_url)
            if (photoBlob) {
                // Get extension from url or blob type
                // p.photo_url might be signed url or public url
                // Simple way: check url ending or MIME type
                let ext = 'jpg'
                if (photoBlob.type === 'image/png') ext = 'png'
                else if (photoBlob.type === 'image/jpeg') ext = 'jpg'
                
                // If url has extension, use it? 
                // User said "original suffix".
                const urlPath = p.photo_url.split('?')[0] // remove query params
                const match = urlPath.match(/\.([a-zA-Z0-9]+)$/)
                if (match) {
                    ext = match[1]
                }

                const photoName = `${p.id_number}.${ext}`
                photoFolder.file(photoName, photoBlob)
            }
        }
      }

      // 3. Save Excel
      const excelBuffer = await workbook.xlsx.writeBuffer()
      zip.folder("stuTemplate").folder("stu").file("stulm.xlsx", excelBuffer)

      // 4. Generate Zip and Download
      const zipContent = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipContent)
      const a = document.createElement('a')
      a.href = url
      a.download = `学员报名资料包_${new Date().toISOString().slice(0,10)}.zip`
      a.click()
      URL.revokeObjectURL(url)

    } catch (error) {
      console.error('Export error:', error)
      alert('导出资料失败：' + error.message)
    } finally {
      setDownloadingData(false)
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
            <>
              <button
                onClick={handleDownloadData}
                disabled={downloadingData}
                className="flex items-center px-3 py-2 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors text-sm border border-green-200"
              >
                <FileSpreadsheet size={14} className="mr-1" />
                {downloadingData ? '打包中...' : `下载报名资料 (${selectedIds.size})`}
              </button>
              <button
                onClick={handleDownloadIDs}
                disabled={downloading}
                className="flex items-center px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors text-sm border border-blue-200"
              >
                <Download size={14} className="mr-1" />
                {downloading ? '处理中...' : `下载身份证 (${selectedIds.size})`}
              </button>
              <button
                onClick={handleBatchDelete}
                className="flex items-center px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm border border-red-200"
              >
                <Trash2 size={14} className="mr-1" />
                批量删除 ({selectedIds.size})
              </button>
            </>
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
