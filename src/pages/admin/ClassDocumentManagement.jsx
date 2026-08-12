import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileArchive, RefreshCw, Trash2, Upload } from 'lucide-react'
import JSZip from 'jszip'
import { supabaseAdmin } from '../../lib/supabase'

const BUCKET = 'class-submission-documents'
const safeName = (value) => String(value || '未命名').replace(/[\\/:*?"<>|]/g, '_')
const toJpeg = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法转换图片')), 'image/jpeg', 0.96)
  }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片，请改用 JPG 或 PNG 文件')) }
  image.src = url
})

export default function ClassDocumentManagement() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [classId, setClassId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabaseAdmin.auth.getUser()
      if (!user) return
      const { data: ownedClasses, error: classError } = await supabaseAdmin.from('classes').select('id,name').eq('admin_id', user.id).order('name')
      if (classError) throw classError
      const ids = (ownedClasses || []).map((item) => item.id)
      const [enrollmentResult, submissionResult] = ids.length ? await Promise.all([
        supabaseAdmin.from('enrollments').select('id,class_id,profile_id,profiles(id,real_name)').in('class_id', ids).order('created_at'),
        supabaseAdmin.from('class_document_submissions').select('*').in('class_id', ids).order('submitted_at', { ascending: false }),
      ]) : [{ data: [], error: null }, { data: [], error: null }]
      if (enrollmentResult.error || submissionResult.error) throw enrollmentResult.error || submissionResult.error
      setClasses(ownedClasses || [])
      setStudents(enrollmentResult.data || [])
      setSubmissions(submissionResult.data || [])
      setClassId((current) => current || ids[0] || '')
    } catch (error) {
      alert(`加载资料状态失败：${error.message}`)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const classStudents = useMemo(() => students.filter((item) => item.class_id === classId), [students, classId])
  const classSubmissions = useMemo(() => submissions.filter((item) => item.class_id === classId), [submissions, classId])
  const matched = useMemo(() => new Map(classSubmissions.filter((item) => item.match_status === 'matched').map((item) => [item.enrollment_id, item])), [classSubmissions])
  const pending = classSubmissions.filter((item) => item.match_status === 'pending')

  const download = async (path, filename) => {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
    if (error) return alert(`下载失败：${error.message}`)
    const link = document.createElement('a'); link.href = URL.createObjectURL(data); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  const view = async (path, title) => {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600)
    if (error) return alert(`预览失败：${error.message}`)
    setPreview({ url: data.signedUrl, title })
  }
  const replaceDocument = async (submissionId, path, file) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) return alert('请选择 12MB 以内的图片文件')
    try {
      const jpeg = await toJpeg(file)
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, jpeg, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' })
      if (error) throw error
      const { error: updateError } = await supabaseAdmin.from('class_document_submissions').update({ updated_at: new Date().toISOString() }).eq('id', submissionId)
      if (updateError) throw updateError
      setPreview(null)
      await load()
      alert('资料已替换')
    } catch (error) { alert(`替换失败：${error.message}`) }
  }
  const removeFiles = async (paths) => { if (paths?.filter(Boolean).length) await supabaseAdmin.storage.from(BUCKET).remove(paths.filter(Boolean)) }
  const deleteSubmission = async (submission) => {
    if (!window.confirm(`确定删除“${submission.submitted_name}”的两份资料吗？`)) return
    const { data, error } = await supabaseAdmin.rpc('delete_class_document_submission', { target_submission_id: submission.id })
    if (error) return alert(`删除失败：${error.message}`)
    await removeFiles([data.criminal_record_path, data.health_declaration_path]); await load()
  }
  const resolveSubmission = async (submission, enrollmentId) => {
    if (!enrollmentId) return
    const { data, error } = await supabaseAdmin.rpc('resolve_class_document_submission', { target_submission_id: submission.id, target_enrollment_id: enrollmentId })
    if (error) return alert(`归档失败：${error.message}`)
    await removeFiles(data.replaced_paths || []); await load()
  }
  const downloadZip = async () => {
    setBusy(true)
    try {
      const zip = new JSZip(); const className = safeName(classes.find((item) => item.id === classId)?.name)
      for (const student of classStudents) {
        const submission = matched.get(student.id); if (!submission) continue
        const name = safeName(student.profiles?.real_name); const folder = zip.folder(name)
        for (const [path, filename] of [[submission.criminal_record_path, `${name}+无犯罪记录.jpg`], [submission.health_declaration_path, `${name}+身体健康申明.jpg`]]) {
          const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path); if (error) throw error; folder.file(filename, data)
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${className}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (error) { alert(`批量下载失败：${error.message}`) } finally { setBusy(false) }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <label className="text-sm font-medium">班级<select value={classId} onChange={(event) => setClassId(event.target.value)} className="ml-3 rounded border px-3 py-2">{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex gap-2"><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><RefreshCw size={16} />刷新</button><button type="button" onClick={downloadZip} disabled={busy || !classId} className="inline-flex items-center gap-2 rounded bg-[var(--ui-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileArchive size={17} />{busy ? '正在打包...' : '下载全班 ZIP'}</button></div>
    </div>
    <div className="overflow-x-auto rounded-lg border border-[var(--ui-border)] bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="px-4 py-3">学员</th><th className="px-4 py-3">提交状态</th><th className="px-4 py-3">无犯罪记录</th><th className="px-4 py-3">身体健康申明</th><th className="px-4 py-3">操作</th></tr></thead><tbody>{classStudents.map((student) => { const submission = matched.get(student.id); const name = safeName(student.profiles?.real_name); return <tr key={student.id} className="border-t"><td className="px-4 py-3 font-medium">{name}</td><td className="px-4 py-3"><span className={submission ? 'text-green-700' : 'text-amber-700'}>{submission ? '已提交两份' : '未提交'}</span></td><td className="px-4 py-3">{submission ? <div className="flex gap-2"><button type="button" title="预览" onClick={() => view(submission.criminal_record_path, `${name}+无犯罪记录`)} className="text-[var(--ui-primary)]"><Eye size={18} /></button><button type="button" title="下载" onClick={() => download(submission.criminal_record_path, `${name}+无犯罪记录.jpg`)} className="text-[var(--ui-primary)]"><Download size={18} /></button><label title="替换" className="cursor-pointer text-amber-700"><Upload size={18} /><input type="file" accept="image/*" className="hidden" onChange={(event) => replaceDocument(submission.id, submission.criminal_record_path, event.target.files?.[0])} /></label></div> : '-'}</td><td className="px-4 py-3">{submission ? <div className="flex gap-2"><button type="button" title="预览" onClick={() => view(submission.health_declaration_path, `${name}+身体健康申明`)} className="text-[var(--ui-primary)]"><Eye size={18} /></button><button type="button" title="下载" onClick={() => download(submission.health_declaration_path, `${name}+身体健康申明.jpg`)} className="text-[var(--ui-primary)]"><Download size={18} /></button><label title="替换" className="cursor-pointer text-amber-700"><Upload size={18} /><input type="file" accept="image/*" className="hidden" onChange={(event) => replaceDocument(submission.id, submission.health_declaration_path, event.target.files?.[0])} /></label></div> : '-'}</td><td className="px-4 py-3">{submission ? <button type="button" onClick={() => deleteSubmission(submission)} className="inline-flex items-center gap-1 text-red-700"><Trash2 size={16} />删除</button> : '-'}</td></tr> })}</tbody></table></div>
    {pending.length ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-900">待处理的姓名不匹配资料</h2><div className="mt-3 space-y-3">{pending.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded bg-white p-3"><b>{item.submitted_name}</b><select defaultValue="" onChange={(event) => resolveSubmission(item, event.target.value)} className="rounded border px-2 py-1 text-sm"><option value="">选择正确学员并归档</option>{classStudents.filter((student) => !matched.has(student.id)).map((student) => <option key={student.id} value={student.id}>{student.profiles?.real_name}</option>)}</select><button type="button" onClick={() => deleteSubmission(item)} className="inline-flex items-center gap-1 text-sm text-red-700"><Trash2 size={16} />删除</button></div>)}</div></section> : null}
    {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="relative max-h-[90vh] w-full max-w-2xl rounded-lg bg-white p-4"><button type="button" onClick={() => setPreview(null)} className="absolute right-3 top-3 text-gray-500">关闭</button><h2 className="mb-3 font-semibold">{preview.title}</h2><img src={preview.url} alt={preview.title} className="mx-auto max-h-[78vh] object-contain" /></div></div> : null}
  </div>
}
