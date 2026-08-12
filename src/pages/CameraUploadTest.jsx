import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, Download, ImagePlus, LoaderCircle, RotateCcw, ScanLine, X } from 'lucide-react'
import { correctDocumentCorners, scanDocument } from './tools/documentScanner'

function ImagePreview({ file, alt, className = '' }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return <img src={url} alt={alt} className={className} />
}

function CornerEditor({ value, onChange }) {
  const editorRef = useRef(null)
  const [corners, setCorners] = useState(value.corners)
  const [saving, setSaving] = useState(false)
  const imageUrl = useMemo(() => URL.createObjectURL(value.original), [value.original])

  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl])

  const moveCorner = (index, event) => {
    const bounds = editorRef.current?.getBoundingClientRect()
    if (!bounds) return
    const nextPoint = {
      x: Math.max(0, Math.min(value.imageWidth, ((event.clientX - bounds.left) / bounds.width) * value.imageWidth)),
      y: Math.max(0, Math.min(value.imageHeight, ((event.clientY - bounds.top) / bounds.height) * value.imageHeight)),
    }
    setCorners((current) => current.map((point, pointIndex) => (pointIndex === index ? nextPoint : point)))
  }

  const apply = async () => {
    setSaving(true)
    const result = await correctDocumentCorners(value.original, corners)
    onChange({ ...value, ...result, corners, confidence: null })
    setSaving(false)
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="mb-2 text-center text-xs font-medium text-amber-800">边界不准时，拖动四个蓝色圆点到纸张真实四角</p>
      <div ref={editorRef} className="relative mx-auto overflow-hidden rounded bg-black" style={{ aspectRatio: `${value.imageWidth} / ${value.imageHeight}` }}>
        <img src={imageUrl} alt="手动调整纸张四角" className="absolute inset-0 h-full w-full object-fill" />
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${value.imageWidth} ${value.imageHeight}`} preserveAspectRatio="none">
          <polygon points={corners.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(250,204,21,.08)" stroke="#facc15" strokeWidth={Math.max(8, value.imageWidth / 220)} />
        </svg>
        {corners.map((point, index) => (
          <button
            key={index}
            type="button"
            aria-label={`调整第 ${index + 1} 个纸张角点`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              moveCorner(index, event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) moveCorner(index, event)
            }}
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-blue-600 shadow-md"
            style={{ left: `${(point.x / value.imageWidth) * 100}%`, top: `${(point.y / value.imageHeight) * 100}%` }}
          />
        ))}
      </div>
      <button type="button" onClick={apply} disabled={saving} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? <LoaderCircle className="animate-spin" size={16} /> : <ScanLine size={16} />}
        {saving ? '正在重新拉正...' : '应用四角并重新裁切'}
      </button>
    </div>
  )
}

function CameraModal({ title, onClose, onCapture }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraResolution, setCameraResolution] = useState('正在启动高清相机...')
  const [processing, setProcessing] = useState(false)
  const unsupported = !navigator.mediaDevices?.getUserMedia
  const error = unsupported ? '当前浏览器不支持调用相机' : cameraError

  useEffect(() => {
    let stream
    if (unsupported) return undefined

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
      audio: false,
    }).then(async (value) => {
      stream = value
      const track = value.getVideoTracks()[0]
      trackRef.current = track
      const capabilities = track.getCapabilities?.() ?? {}
      if (capabilities.focusMode?.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => undefined)
      }
      if (videoRef.current) videoRef.current.srcObject = value
      const settings = track.getSettings?.() ?? {}
      setCameraResolution(`${settings.width ?? '-'} x ${settings.height ?? '-'} · 连续自动对焦`)
    }).catch(() => {
      setCameraError('无法打开相机。请允许浏览器使用相机，或改为从相册上传。')
    })

    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [unsupported])

  const capture = async () => {
    const video = videoRef.current
    if (!video?.videoWidth || processing) return
    setProcessing(true)
    setCameraError('')

    let source
    let originalBlob
    try {
      if (window.ImageCapture && trackRef.current) {
        try {
          originalBlob = await new window.ImageCapture(trackRef.current).takePhoto()
        } catch {
          originalBlob = null
        }
      }

      if (!originalBlob) {
        source = document.createElement('canvas')
        source.width = video.videoWidth
        source.height = video.videoHeight
        source.getContext('2d').drawImage(video, 0, 0)
        originalBlob = await new Promise((resolve) => source.toBlob(resolve, 'image/jpeg', 0.98))
      }

      if (!originalBlob) throw new Error('拍照失败，请重试。')
      const original = new File([originalBlob], 'camera-original.jpg', { type: 'image/jpeg' })
      onCapture(await scanDocument(original))
    } catch (captureError) {
      setCameraError(captureError.message || '纸张识别失败，请重拍。')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-black text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">拍摄{title}</span>
          <button type="button" onClick={onClose} aria-label="关闭相机"><X /></button>
        </div>
        <div className="relative aspect-[3/4]">
          <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute left-[10%] top-1/2 aspect-[1/1.414] w-[80%] -translate-y-1/2 border-4 border-yellow-400 shadow-[0_0_0_999px_rgba(0,0,0,.42)]" />
          <div className="pointer-events-none absolute inset-x-[12%] top-[11%] flex items-center justify-center gap-1 text-xs font-semibold text-yellow-200">
            <ScanLine size={15} /> 将完整 A4 纸放入黄色框内
          </div>
          <p className="absolute inset-x-4 top-3 text-center text-xs text-white/80">{cameraResolution}</p>
          <p className="absolute inset-x-5 bottom-4 text-center text-sm text-yellow-100">
            四条纸边都要清晰可见，纸张与背景保持明显对比
          </p>
          {processing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
              <LoaderCircle className="animate-spin" size={34} />
              <p className="text-sm font-medium">正在识别纸张四角并拉正...</p>
            </div>
          ) : null}
        </div>
        {error ? <p className="bg-red-950 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex gap-3 p-4">
          <button type="button" onClick={onClose} disabled={processing} className="flex-1 rounded-md border border-white/30 py-3 text-sm disabled:opacity-50">取消</button>
          <button type="button" disabled={unsupported || processing} onClick={capture} className="flex-1 rounded-md bg-yellow-400 py-3 text-sm font-bold text-gray-950 disabled:opacity-50">
            {processing ? '处理中...' : '拍照并自动扫描'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ title, value, onChange, onOpenCamera }) {
  const inputRef = useRef(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const selectFile = async (file) => {
    if (!file?.type.startsWith('image/')) return
    setProcessing(true)
    setError('')
    try {
      onChange(await scanDocument(file))
    } catch (scanError) {
      setError(scanError.message || '纸张识别失败，请重新选择图片。')
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const downloadCropped = () => {
    const url = URL.createObjectURL(value.cropped)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title}-透视校正结果.jpg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--ui-title)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">自动识别四角、裁切纸边并拉正透视</p>
        </div>
        {value ? <button type="button" onClick={() => onChange(null)} className="text-sm text-[var(--ui-primary)]">重新拍摄</button> : null}
      </div>
      {value ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <figure>
              <figcaption className="mb-2 text-center text-xs font-medium text-[var(--ui-muted)]">检测到的纸张边界</figcaption>
              <ImagePreview file={value.boundary} alt={`${title}纸张边界`} className="aspect-[1/1.414] w-full rounded border bg-gray-100 object-contain" />
            </figure>
            <figure>
              <figcaption className="mb-2 text-center text-xs font-medium text-[var(--ui-primary)]">透视校正结果</figcaption>
              <ImagePreview file={value.cropped} alt={`${title}透视校正结果`} className="aspect-[1/1.414] w-full rounded border border-blue-300 bg-gray-100 object-contain" />
            </figure>
          </div>
          {value.confidence ? (
            <p className="rounded-md bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-700">
              已自动识别纸张 · 请检查黄色边线，若不贴边请拖动下方四个角点
            </p>
          ) : (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-center text-xs font-medium text-blue-700">已按手动确认的四个角点重新裁切</p>
          )}
          <CornerEditor value={value} onChange={onChange} />
          <button type="button" onClick={downloadCropped} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--ui-primary)] py-2 text-sm font-medium text-[var(--ui-primary)]">
            <Download size={17} /> 下载透视校正结果
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" disabled={processing} onClick={() => inputRef.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] text-sm font-medium disabled:opacity-50">
            {processing ? <LoaderCircle className="animate-spin" size={23} /> : <ImagePlus size={23} />}
            {processing ? '正在扫描...' : '从相册上传'}
          </button>
          <button type="button" disabled={processing} onClick={onOpenCamera} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg bg-[var(--ui-primary)] text-sm font-medium text-white disabled:opacity-50">
            <Camera size={23} />拍照上传
          </button>
        </div>
      )}
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
    </section>
  )
}

export default function CameraUploadTest() {
  const [criminalRecord, setCriminalRecord] = useState(null)
  const [healthDeclaration, setHealthDeclaration] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [cameraTarget, setCameraTarget] = useState(null)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (!criminalRecord || !healthDeclaration || !studentName.trim()) {
      setMessage('请完成两份资料上传并填写姓名')
      return
    }
    if (!window.confirm('确认您是本班级学员吗？')) return
    setDone(true)
    setMessage('测试流程已完成。请下载两张透视校正结果并发送给我审查。')
  }

  return (
    <main className="min-h-screen bg-[var(--ui-page)] px-4 py-8">
      <div className="mx-auto max-w-lg">
        <header className="mb-6">
          <p className="text-sm font-semibold text-[var(--ui-primary)]">拍照上传流程测试</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--ui-title)]">学员资料拍照上传</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">本页测试纸张四角识别、精确裁切和透视拉正，不保存正式资料。</p>
        </header>
        {done ? (
          <section className="rounded-lg border border-green-200 bg-white p-7 text-center shadow-sm">
            <CheckCircle2 className="mx-auto text-green-600" size={44} />
            <p className="mt-4 font-semibold">{message}</p>
            <button type="button" onClick={() => { setDone(false); setCriminalRecord(null); setHealthDeclaration(null); setStudentName('') }} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--ui-primary)]">
              <RotateCcw size={16} />重新测试
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DocumentCard title="无犯罪记录" value={criminalRecord} onChange={setCriminalRecord} onOpenCamera={() => setCameraTarget('criminal')} />
            <DocumentCard title="身体健康申明" value={healthDeclaration} onChange={setHealthDeclaration} onOpenCamera={() => setCameraTarget('health')} />
            <section className="rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <label className="block text-sm font-semibold">学员姓名</label>
              <input value={studentName} onChange={(event) => setStudentName(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[var(--ui-border)] px-3" placeholder="请输入姓名" />
            </section>
            {message ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
            <button className="w-full rounded-md bg-[var(--ui-primary)] py-3 font-semibold text-white">完成本次测试</button>
          </form>
        )}
      </div>
      {cameraTarget ? (
        <CameraModal
          title={cameraTarget === 'criminal' ? '无犯罪记录' : '身体健康申明'}
          onClose={() => setCameraTarget(null)}
          onCapture={(file) => {
            if (cameraTarget === 'criminal') setCriminalRecord(file)
            else setHealthDeclaration(file)
            setCameraTarget(null)
          }}
        />
      ) : null}
    </main>
  )
}
