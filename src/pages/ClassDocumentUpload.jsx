import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, LoaderCircle, ShieldCheck, Smartphone, X } from 'lucide-react'
import { createScan, defaultCorners } from './tools/documentScanner'

const MAX_FILE_SIZE = 12 * 1024 * 1024

function Preview({ file, alt, className = '' }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt={alt} className={className} />
}

function CameraDialog({ title, onClose, onCapture, onFallback }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let stream
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持网页相机，请调用手机系统相机。')
      return undefined
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
      .then((value) => { stream = value; trackRef.current = value.getVideoTracks()[0]; if (videoRef.current) videoRef.current.srcObject = value })
      .catch(() => setError('无法打开网页相机，请允许相机权限，或调用手机系统相机。'))
    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [])
  const capture = async () => {
    if (!videoRef.current?.videoWidth || busy) return
    setBusy(true)
    try {
      let blob
      if (window.ImageCapture && trackRef.current) {
        try { blob = await new window.ImageCapture(trackRef.current).takePhoto() } catch { blob = null }
      }
      if (!blob) {
        const canvas = document.createElement('canvas'); canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0); blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98))
      }
      if (!blob) throw new Error('拍照失败，请重试')
      onCapture(new File([blob], 'camera-original.jpg', { type: 'image/jpeg' }))
    } catch (captureError) { setError(captureError.message) } finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"><div className="w-full max-w-md overflow-hidden rounded-lg bg-black text-white"><div className="flex items-center justify-between px-4 py-3"><b>拍摄{title}</b><button type="button" onClick={onClose} aria-label="关闭相机"><X /></button></div><div className="relative aspect-[3/4]"><video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" /><div className="pointer-events-none absolute left-[10%] top-1/2 aspect-[1/1.414] w-[80%] -translate-y-1/2 border-4 border-yellow-400 shadow-[0_0_0_999px_rgba(0,0,0,.42)]" /><p className="absolute inset-x-5 bottom-4 text-center text-sm text-yellow-100">黄色框仅作位置引导，拍照后请手动确认纸张四角</p>{busy ? <div className="absolute inset-0 flex items-center justify-center bg-black/70"><LoaderCircle className="animate-spin" /></div> : null}</div>{error ? <p className="bg-red-950 px-4 py-3 text-sm text-red-100">{error}</p> : null}<div className="grid grid-cols-3 gap-2 p-4"><button type="button" onClick={onClose} className="rounded-md border border-white/30 py-3">取消</button><button type="button" onClick={onFallback} className="inline-flex items-center justify-center gap-1 rounded-md border border-yellow-300 py-3 text-sm text-yellow-200"><Smartphone size={17} />系统相机</button><button type="button" onClick={capture} disabled={busy || Boolean(error)} className="rounded-md bg-yellow-400 py-3 font-semibold text-black disabled:opacity-40">拍照</button></div></div></div>
}

function CornerConfirm({ value, onConfirm, onRetry }) {
  const editorRef = useRef(null)
  const [corners, setCorners] = useState(value.corners)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const url = useMemo(() => URL.createObjectURL(value.original), [value.original])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const move = (index, event) => { const bounds = editorRef.current?.getBoundingClientRect(); if (!bounds) return; const point = { x: Math.max(0, Math.min(value.width, (event.clientX - bounds.left) / bounds.width * value.width)), y: Math.max(0, Math.min(value.height, (event.clientY - bounds.top) / bounds.height * value.height)) }; setCorners((current) => current.map((item, itemIndex) => itemIndex === index ? point : item)) }
  const confirm = async () => {
    setBusy(true)
    setError('')
    try { onConfirm(await createScan(value.original, corners)) }
    catch (scanError) { setError(scanError instanceof Error ? scanError.message : '生成扫描件失败，请重新拍摄') }
    finally { setBusy(false) }
  }
  return <section className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="mb-2 text-center text-xs font-medium text-amber-800">拖动蓝色圆点，准确贴紧纸张四个角</p><div ref={editorRef} className="relative mx-auto overflow-hidden rounded bg-black" style={{ aspectRatio: `${value.width}/${value.height}` }}><img src={url} alt="待确认的原始照片" className="absolute inset-0 h-full w-full object-fill" /><svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${value.width} ${value.height}`} preserveAspectRatio="none"><polygon points={corners.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(250,204,21,.08)" stroke="#facc15" strokeWidth={Math.max(8, value.width / 220)} /></svg>{corners.map((point, index) => <button key={index} type="button" aria-label={`调整第${index + 1}个角点`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(index, event) }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(index, event) }} className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-blue-600" style={{ left: `${point.x / value.width * 100}%`, top: `${point.y / value.height * 100}%` }} />)}</div>{error ? <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}<div className="mt-3 flex gap-2"><button type="button" onClick={onRetry} className="flex-1 rounded-md border border-amber-700 py-2 text-sm text-amber-800">重新拍摄</button><button type="button" onClick={confirm} disabled={busy} className="flex-1 rounded-md bg-amber-600 py-2 text-sm font-semibold text-white">{busy ? '正在生成扫描件...' : '确认四角并生成扫描件'}</button></div></section>
}

function DocumentField({ label, value, onChange, onOpenCamera }) {
  const inputRef = useRef(null)
  const captureInputRef = useRef(null)
  const [error, setError] = useState('')
  const choose = async (file) => { if (!file?.type.startsWith('image/') || file.size > MAX_FILE_SIZE) { setError('请上传 12MB 以内的图片文件'); return } setError(''); const image = await new Promise((resolve, reject) => { const item = new Image(); const url = URL.createObjectURL(file); item.onload = () => { URL.revokeObjectURL(url); resolve(item) }; item.onerror = reject; item.src = url }); onChange({ original: file, width: image.naturalWidth, height: image.naturalHeight, corners: defaultCorners(image.naturalWidth, image.naturalHeight), cropped: null }) }
  return <section className="rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm"><h2 className="font-semibold">{label}</h2><p className="mt-1 text-sm text-[var(--ui-muted)]">单独提交一张 A4 资料，拍照阶段不做背景检测</p>{value?.cropped ? <Preview file={value.cropped} alt={`${label}扫描件`} className="mt-3 aspect-[1/1.414] w-full rounded border object-contain" /> : value ? <CornerConfirm value={value} onConfirm={onChange} onRetry={() => onChange(null)} /> : null}<div className="mt-3 grid grid-cols-2 gap-3">{!value ? <><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded border"><ImagePlus size={21} />从相册上传</button><button type="button" onClick={onOpenCamera} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded bg-[var(--ui-primary)] text-white"><Camera size={21} />拍照上传</button></> : <button type="button" onClick={() => onChange(null)} className="col-span-2 rounded border py-2 text-sm">重新选择</button>}</div>{error ? <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}<input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /><input ref={captureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /><button type="button" data-system-camera={label} className="hidden" onClick={() => captureInputRef.current?.click()} /></section>
}

export default function ClassDocumentUpload() {
  const { accessToken } = useParams()
  const [name, setName] = useState(''); const [criminal, setCriminal] = useState(null); const [health, setHealth] = useState(null); const [camera, setCamera] = useState(null); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false); const [done, setDone] = useState(false); const [doneStatus, setDoneStatus] = useState('')
  const submit = async (event) => { event.preventDefault(); if (!name.trim() || !criminal?.cropped || !health?.cropped) { setMessage('请完成两份资料的四角确认并填写姓名'); return } if (!window.confirm('确认您是本班级学员吗？')) return; setLoading(true); setMessage(''); try { const form = new FormData(); form.set('accessToken', accessToken); form.set('studentName', name.trim()); form.set('criminalRecord', criminal.cropped); form.set('healthDeclaration', health.cropped); const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY; const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-class-documents`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error || '上传失败'); setDoneStatus(result.status); setDone(true); setMessage(result.status === 'matched' ? '资料已提交成功，新提交资料会覆盖旧资料。' : '姓名未在本班级名单中匹配。资料已进入管理员“待核对”列表，请联系管理员确认姓名。') } catch (error) { setMessage(error.message) } finally { setLoading(false) } }
  const openSystemCamera = (type) => { document.querySelector(`[data-system-camera="${type === 'criminal' ? '无犯罪记录' : '身体健康申明'}"]`)?.click(); setCamera(null) }
  return <main className="min-h-screen bg-[var(--ui-page)] px-4 py-8"><div className="mx-auto max-w-lg"><header className="mb-6"><div className="flex gap-2 text-[var(--ui-primary)]"><ShieldCheck /><span className="font-semibold">班级资料收集</span></div><h1 className="mt-2 text-2xl font-bold">提交无犯罪记录及身体健康申明</h1><p className="mt-2 text-sm text-[var(--ui-muted)]">拍照后必须手动确认四角，系统才会生成扫描件并允许提交。</p></header>{done ? <section className={`rounded-lg border p-8 text-center shadow-sm ${doneStatus === 'matched' ? 'border-green-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>{doneStatus === 'matched' ? <CheckCircle2 className="mx-auto text-green-600" size={44} /> : <AlertTriangle className="mx-auto text-amber-600" size={44} />}<p className="mt-4 font-semibold">{message}</p></section> : <form onSubmit={submit} className="space-y-4"><DocumentField label="无犯罪记录" value={criminal} onChange={setCriminal} onOpenCamera={() => setCamera('criminal')} /><DocumentField label="身体健康申明" value={health} onChange={setHealth} onOpenCamera={() => setCamera('health')} /><section className="rounded-lg border bg-white p-4"><label className="text-sm font-semibold">学员姓名</label><input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded border px-3" placeholder="请输入姓名" /></section>{message ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}<button disabled={loading} className="w-full rounded bg-[var(--ui-primary)] py-3 font-semibold text-white disabled:opacity-60">{loading ? '正在上传...' : '确认并保存上传'}</button></form>}</div>{camera ? <CameraDialog title={camera === 'criminal' ? '无犯罪记录' : '身体健康申明'} onClose={() => setCamera(null)} onFallback={() => openSystemCamera(camera)} onCapture={async (file) => { const image = await new Promise((resolve, reject) => { const item = new Image(); const url = URL.createObjectURL(file); item.onload = () => { URL.revokeObjectURL(url); resolve(item) }; item.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取拍摄照片')) }; item.src = url }); const value = { original: file, width: image.naturalWidth, height: image.naturalHeight, corners: defaultCorners(image.naturalWidth, image.naturalHeight), cropped: null }; camera === 'criminal' ? setCriminal(value) : setHealth(value); setCamera(null) }} /> : null}</main>
}
