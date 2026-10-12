import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye, FileArchive, RefreshCw, Trash2, Upload } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabase'
import { downloadWithRetry } from '../../lib/resilientDownload'
import { downloadClassArchive, generateClassArchive, prepareClassArchive, safeArchiveName } from './ClassDocumentArchive'

const BUCKET = 'class-submission-documents'
const safeName = safeArchiveName
const downloadStorageBlob = (path, options) => downloadWithRetry(async () => {
  if (!path) throw Object.assign(new Error('资料路径为空'), { retryable: false })
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}, options)
const saveArchive = (url, name) => {
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName(name)}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
}
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

export default function ClassDocumentManagement({ initialClassId = '' }) {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [classId, setClassId] = useState('')
  const [loading, setLoading] = useState(true)
  const [runningClassId, setRunningClassId] = useState('')
  const busy = Boolean(classId && runningClassId === classId)
  const [zipProgress, setZipProgress] = useState(null)
  const [preview, setPreview] = useState(null)
  const archiveRef = useRef(null)
  const downloadControllerRef = useRef(null)
  const archiveUrlRef = useRef(null)

  useEffect(() => () => {
    // A different class or leaving this page releases private documents and
    // cancels outstanding requests. Never persist student files in localStorage.
    downloadControllerRef.current?.abort()
    downloadControllerRef.current = null
    archiveRef.current = null
    if (archiveUrlRef.current) URL.revokeObjectURL(archiveUrlRef.current)
    archiveUrlRef.current = null
  }, [classId])

  const load = useCallback(async () => {
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
      setClassId((current) => (initialClassId && ids.includes(initialClassId) ? initialClassId : current || ids[0] || ''))
    } catch (error) {
      alert(`加载资料状态失败：${error.message}`)
    } finally { setLoading(false) }
  }, [initialClassId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (initialClassId) setClassId(initialClassId) }, [initialClassId])

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
  const removeFiles = async (paths) => {
    const targets = paths?.filter(Boolean) || []
    if (!targets.length) return
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(targets)
    return error || null
  }
  const deleteSubmission = async (submission) => {
    if (!window.confirm(`确定删除“${submission.submitted_name}”的两份资料吗？`)) return
    // Use the row id directly here. Older deployments have a buggy delete RPC
    // that tries to coerce a whole composite record into UUID text. RLS still
    // limits this delete to submissions belonging to the signed-in admin's
    // classes, and the migration fixes the RPC for deployments that use it.
    const { data: deletedRows, error } = await supabaseAdmin
      .from('class_document_submissions')
      .delete()
      .eq('id', submission.id)
      .select('id')
    if (error) return alert(`删除失败：${error.message}`)
    if (!deletedRows?.length) return alert('删除失败：资料记录不存在或当前管理员无权删除')
    const fileError = await removeFiles([submission.criminal_record_path, submission.health_declaration_path])
    if (fileError) return alert(`资料记录已删除，但图片文件清理失败：${fileError.message}`)
    await load()
  }
  const resolveSubmission = async (submission, enrollmentId) => {
    if (!enrollmentId) return
    const { data, error } = await supabaseAdmin.rpc('resolve_class_document_submission', { target_submission_id: submission.id, target_enrollment_id: enrollmentId })
    if (error) return alert(`归档失败：${error.message}`)
    await removeFiles(data.replaced_paths || []); await load()
  }
  const downloadZip = async () => {
    if (downloadControllerRef.current) return
    const className = safeName(classes.find((item) => item.id === classId)?.name)
    const items = classStudents.flatMap((student) => {
      const submission = matched.get(student.id)
      if (!submission) return []
      const name = safeName(student.profiles?.real_name)
      return [
        { path: submission.criminal_record_path, folder: name, filename: `${name}+无犯罪记录.jpg`, label: `${name}+无犯罪记录` },
        { path: submission.health_declaration_path, folder: name, filename: `${name}+身体健康申明.jpg`, label: `${name}+身体健康申明` },
      ].map((item) => ({ ...item, key: JSON.stringify([submission.id, submission.updated_at, item.path]) }))
    })
    if (!items.length) return alert('当前班级没有已提交的资料，暂时无法生成 ZIP')
    const session = prepareClassArchive(archiveRef.current, classId, className, items)
    if (archiveRef.current !== session && archiveUrlRef.current) {
      URL.revokeObjectURL(archiveUrlRef.current)
      archiveUrlRef.current = null
    }
    archiveRef.current = session
    const controller = new AbortController()
    downloadControllerRef.current = controller
    const { signal } = controller
    const isCurrent = () => downloadControllerRef.current === controller
    setRunningClassId(classId)
    setZipProgress({ classId, phase: 'download', completed: session.blobs.size, total: items.length, active: [] })
    try {
      if (!session.zipBlob) {
        let lastUpdate = 0
        let lastState = ''
        const failures = await downloadClassArchive(session, {
          signal,
          downloadFile: (item, options) => downloadStorageBlob(item.path, options),
          onProgress: (progress) => {
            if (!isCurrent() || signal.aborted) return
            const state = JSON.stringify([progress.completed, progress.active.map((item) => [item.label, item.phase, item.attempt])])
            if (state === lastState && Date.now() - lastUpdate < 200) return
            lastUpdate = Date.now()
            lastState = state
            setZipProgress({ classId, phase: 'download', ...progress })
          },
        })
        if (failures.length) {
          setZipProgress({ classId, phase: 'error', completed: session.blobs.size, total: items.length, failures })
          return
        }
      }
      setZipProgress({ classId, phase: 'zip', completed: items.length, total: items.length, percent: 0 })
      const blob = await generateClassArchive(session, {
        signal,
        onProgress: (percent) => {
          if (isCurrent()) setZipProgress({ classId, phase: 'zip', completed: items.length, total: items.length, percent })
        },
      })
      if (!isCurrent() || signal.aborted) return
      if (!archiveUrlRef.current) archiveUrlRef.current = URL.createObjectURL(blob)
      saveArchive(archiveUrlRef.current, className)
      setZipProgress({ classId, phase: 'done', completed: items.length, total: items.length })
    } catch (error) {
      if (isCurrent()) setZipProgress({
        classId, phase: signal.aborted ? 'paused' : 'error',
        completed: session.blobs.size, total: items.length,
        failures: signal.aborted ? [] : [{ label: '生成 ZIP', message: error.message }],
      })
    } finally {
      if (isCurrent()) {
        downloadControllerRef.current = null
        setRunningClassId('')
      }
    }
  }

  const progress = zipProgress?.classId === classId ? zipProgress : null
  const canResume = progress?.phase === 'paused' || progress?.phase === 'error'

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <label className="text-sm font-medium">班级<select value={classId} disabled={busy} onChange={(event) => { setZipProgress(null); setClassId(event.target.value) }} className="ml-3 rounded border px-3 py-2">{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" disabled={busy} onClick={load} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} />刷新</button>
        <button type="button" onClick={downloadZip} disabled={busy || !classId} className="inline-flex items-center gap-2 rounded bg-[var(--ui-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileArchive size={17} />{busy ? (progress?.phase === 'zip' ? `正在生成 ZIP ${progress.percent}%` : `已下载 ${progress?.completed || 0}/${progress?.total || 0}`) : canResume ? '继续下载缺失资料' : progress?.phase === 'done' ? '再次保存 ZIP' : '下载全班 ZIP'}</button>
        {busy ? <button type="button" onClick={() => downloadControllerRef.current?.abort()} className="rounded border px-3 py-2 text-sm">暂停</button> : null}
      </div>
    </div>
    {progress ? <section aria-label="打包下载进度" className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-white p-4 text-sm">
      <div role="status" aria-live="polite">
        {progress.phase === 'download' ? `已完成 ${progress.completed}/${progress.total} 份资料 · 已接收 ${((progress.bytes || 0) / 1024 / 1024).toFixed(1)} MB` : null}
        {progress.phase === 'zip' ? `资料已全部下载，正在生成 ZIP：${progress.percent}%` : null}
        {progress.phase === 'done' ? '完整 ZIP 已生成并已发起保存。如浏览器未开始下载，请点击“再次保存 ZIP”。' : null}
        {progress.phase === 'paused' ? `已暂停，已保留 ${progress.completed}/${progress.total} 份资料，点击“继续下载缺失资料”即可接着下载。` : null}
        {progress.phase === 'error' ? `尚未生成完整 ZIP，已保留 ${progress.completed}/${progress.total} 份资料。网络恢复后可继续下载缺失资料。` : null}
      </div>
      {progress.phase === 'download' ? <ul className="space-y-1 text-[var(--ui-muted)]">{progress.active?.map((item) => <li key={item.label}>{item.label}：{item.phase === 'offline' ? '网络已断开，连接恢复后自动继续' : item.phase === 'retry' ? `网络不稳定，稍后自动重试（第 ${item.attempt + 1}/${item.maxAttempts} 次尝试）` : '正在下载'}</li>)}</ul> : null}
      {progress.failures?.length ? <details className="text-amber-800"><summary className="cursor-pointer">查看未完成原因（{progress.failures.length}）</summary><ul className="mt-2 space-y-1">{progress.failures.map((item, index) => <li key={index}>{item.label}：{item.message}</li>)}</ul></details> : null}
      {progress.phase !== 'done' ? <p className="text-xs text-[var(--ui-muted)]">慢速传输会持续等待。请保持本页打开；刷新网页、切换班级或离开本页会清除本次下载进度。</p> : null}
    </section> : null}
    <fieldset disabled={busy} className="contents">
    <div className="overflow-x-auto rounded-lg border border-[var(--ui-border)] bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="px-4 py-3">学员</th><th className="px-4 py-3">提交状态</th><th className="px-4 py-3">无犯罪记录</th><th className="px-4 py-3">身体健康申明</th><th className="px-4 py-3">操作</th></tr></thead><tbody>{classStudents.map((student) => { const submission = matched.get(student.id); const name = safeName(student.profiles?.real_name); return <tr key={student.id} className="border-t"><td className="px-4 py-3 font-medium">{name}</td><td className="px-4 py-3"><span className={submission ? 'text-green-700' : 'text-amber-700'}>{submission ? '已提交两份' : '未提交'}</span></td><td className="px-4 py-3">{submission ? <div className="flex gap-2"><button type="button" title="预览" onClick={() => view(submission.criminal_record_path, `${name}+无犯罪记录`)} className="text-[var(--ui-primary)]"><Eye size={18} /></button><button type="button" title="下载" onClick={() => download(submission.criminal_record_path, `${name}+无犯罪记录.jpg`)} className="text-[var(--ui-primary)]"><Download size={18} /></button><label title="替换" className="cursor-pointer text-amber-700"><Upload size={18} /><input type="file" accept="image/*" className="hidden" onChange={(event) => replaceDocument(submission.id, submission.criminal_record_path, event.target.files?.[0])} /></label></div> : '-'}</td><td className="px-4 py-3">{submission ? <div className="flex gap-2"><button type="button" title="预览" onClick={() => view(submission.health_declaration_path, `${name}+身体健康申明`)} className="text-[var(--ui-primary)]"><Eye size={18} /></button><button type="button" title="下载" onClick={() => download(submission.health_declaration_path, `${name}+身体健康申明.jpg`)} className="text-[var(--ui-primary)]"><Download size={18} /></button><label title="替换" className="cursor-pointer text-amber-700"><Upload size={18} /><input type="file" accept="image/*" className="hidden" onChange={(event) => replaceDocument(submission.id, submission.health_declaration_path, event.target.files?.[0])} /></label></div> : '-'}</td><td className="px-4 py-3">{submission ? <button type="button" onClick={() => deleteSubmission(submission)} className="inline-flex items-center gap-1 text-red-700"><Trash2 size={16} />删除</button> : '-'}</td></tr> })}</tbody></table></div>
    {pending.length ? <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">待核对姓名资料（{pending.length}）</h2><p className="mt-1 text-sm text-amber-800">以下姓名未匹配班级名单，必须选择正确学员归档或删除。</p><div className="mt-3 space-y-3">{pending.map((item) => <div key={item.id} className="rounded border border-amber-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{item.submitted_name}</b><span className="ml-2 text-xs text-amber-700">名单中无此姓名</span></div><button type="button" onClick={() => deleteSubmission(item)} className="inline-flex items-center gap-1 text-sm text-red-700"><Trash2 size={16} />删除</button></div><div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm font-medium">无犯罪记录</span><button type="button" onClick={() => view(item.criminal_record_path, `${item.submitted_name}+无犯罪记录`)} className="inline-flex items-center gap-1 text-sm text-[var(--ui-primary)]"><Eye size={16} />预览</button><button type="button" onClick={() => download(item.criminal_record_path, `${safeName(item.submitted_name)}+无犯罪记录.jpg`)} className="inline-flex items-center gap-1 text-sm text-[var(--ui-primary)]"><Download size={16} />下载</button><span className="ml-2 text-sm font-medium">身体健康申明</span><button type="button" onClick={() => view(item.health_declaration_path, `${item.submitted_name}+身体健康申明`)} className="inline-flex items-center gap-1 text-sm text-[var(--ui-primary)]"><Eye size={16} />预览</button><button type="button" onClick={() => download(item.health_declaration_path, `${safeName(item.submitted_name)}+身体健康申明.jpg`)} className="inline-flex items-center gap-1 text-sm text-[var(--ui-primary)]"><Download size={16} />下载</button></div><label className="mt-3 block text-sm font-medium">修改为正确姓名<select defaultValue="" onChange={(event) => resolveSubmission(item, event.target.value)} className="ml-3 rounded border px-2 py-1 text-sm"><option value="">请选择本班学员</option>{classStudents.filter((student) => !matched.has(student.id)).map((student) => <option key={student.id} value={student.id}>{student.profiles?.real_name}</option>)}</select></label></div>)}</div></section> : null}
    </fieldset>
    {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="relative max-h-[90vh] w-full max-w-2xl rounded-lg bg-white p-4"><button type="button" onClick={() => setPreview(null)} className="absolute right-3 top-3 text-gray-500">关闭</button><h2 className="mb-3 font-semibold">{preview.title}</h2><img src={preview.url} alt={preview.title} className="mx-auto max-h-[78vh] object-contain" /></div></div> : null}
  </div>
}
