import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, Download, ImagePlus, RotateCcw, ScanLine, X } from 'lucide-react'

const cropToA4 = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const sourceUrl = URL.createObjectURL(file)

  image.onload = () => {
    const targetRatio = 1 / Math.sqrt(2)
    let sourceWidth = image.width
    let sourceHeight = image.height
    let sourceX = 0
    let sourceY = 0

    if (sourceWidth / sourceHeight > targetRatio) {
      sourceWidth = sourceHeight * targetRatio
      sourceX = (image.width - sourceWidth) / 2
    } else {
      sourceHeight = sourceWidth / targetRatio
      sourceY = (image.height - sourceHeight) / 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1240
    canvas.height = 1754
    canvas.getContext('2d').drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    canvas.toBlob((blob) => {
      URL.revokeObjectURL(sourceUrl)
      if (!blob) {
        reject(new Error('图片处理失败'))
        return
      }
      resolve(new File([blob], 'a4-document.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  image.onerror = () => {
    URL.revokeObjectURL(sourceUrl)
    reject(new Error('无法读取图片'))
  }
  image.src = sourceUrl
})

function ImagePreview({ file, alt, className = '' }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  return <img src={url} alt={alt} className={className} />
}

function CameraModal({ title, onClose, onCapture }) {
  const videoRef = useRef(null)
  const frameRef = useRef(null)
  const trackRef = useRef(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraResolution, setCameraResolution] = useState('正在启动高清相机...')
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
      setCameraResolution(`${settings.width ?? '-'} × ${settings.height ?? '-'} · 连续自动对焦`)
    }).catch(() => {
      setCameraError('无法打开相机。请允许浏览器使用相机，或改为从相册上传。')
    })

    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [unsupported])

  const capture = async () => {
    const video = videoRef.current
    const frame = frameRef.current
    if (!video?.videoWidth || !frame) return

    const videoRect = video.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    let source
    let captureWidth
    let captureHeight
    let originalBlob

    if (window.ImageCapture && trackRef.current) {
      try {
        originalBlob = await new window.ImageCapture(trackRef.current).takePhoto()
        source = await createImageBitmap(originalBlob)
        captureWidth = source.width
        captureHeight = source.height
      } catch {
        source = video
        captureWidth = video.videoWidth
        captureHeight = video.videoHeight
      }
    } else {
      source = video
      captureWidth = video.videoWidth
      captureHeight = video.videoHeight
    }

    const scale = Math.max(
      videoRect.width / captureWidth,
      videoRect.height / captureHeight,
    )
    const renderedWidth = captureWidth * scale
    const renderedHeight = captureHeight * scale
    const hiddenX = (renderedWidth - videoRect.width) / 2
    const hiddenY = (renderedHeight - videoRect.height) / 2
    const cropX = (frameRect.left - videoRect.left + hiddenX) / scale
    const cropY = (frameRect.top - videoRect.top + hiddenY) / scale
    const cropWidth = frameRect.width / scale
    const cropHeight = frameRect.height / scale

    const originalCanvas = document.createElement('canvas')
    originalCanvas.width = captureWidth
    originalCanvas.height = captureHeight
    originalCanvas.getContext('2d').drawImage(source, 0, 0)

    const croppedCanvas = document.createElement('canvas')
    const outputScale = Math.min(1, 1654 / cropWidth, 2339 / cropHeight)
    croppedCanvas.width = Math.max(1, Math.round(cropWidth * outputScale))
    croppedCanvas.height = Math.max(1, Math.round(cropHeight * outputScale))
    croppedCanvas.getContext('2d').drawImage(
      source,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      croppedCanvas.width,
      croppedCanvas.height,
    )

    const blobs = await Promise.all([
      originalBlob ?? new Promise((resolve) => originalCanvas.toBlob(resolve, 'image/jpeg', 0.98)),
      new Promise((resolve) => croppedCanvas.toBlob(resolve, 'image/jpeg', 0.96)),
    ]).then(([originalBlob, croppedBlob]) => {
      if (!originalBlob || !croppedBlob) return
      return { originalBlob, croppedBlob }
    })

    if (source !== video) source.close?.()
    if (!blobs) return
    onCapture({
      original: new File([blobs.originalBlob], 'camera-original.jpg', { type: 'image/jpeg' }),
      cropped: new File([blobs.croppedBlob], 'camera-a4-cropped.jpg', { type: 'image/jpeg' }),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-black text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">拍摄{title}</span>
          <button type="button" onClick={onClose} aria-label="关闭相机"><X /></button>
        </div>
        {error ? (
          <p className="px-4 pb-4 text-sm text-red-200">{error}</p>
        ) : (
          <div className="relative aspect-[3/4]">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <div ref={frameRef} className="pointer-events-none absolute left-[12%] top-1/2 aspect-[1/1.414] w-[76%] -translate-y-1/2 border-4 border-yellow-400 shadow-[0_0_0_999px_rgba(0,0,0,.45)]" />
            <div className="pointer-events-none absolute inset-x-[16%] top-[12%] flex items-center justify-center gap-1 text-xs font-semibold text-yellow-200">
              <ScanLine size={15} />黄色框内放入完整 A4 纸
            </div>
            <p className="absolute inset-x-4 top-3 text-center text-xs text-white/80">{cameraResolution}</p>
            <p className="absolute inset-x-5 bottom-4 text-center text-sm text-yellow-100">
              保持手机与纸张平行，避免阴影和反光
            </p>
          </div>
        )}
        <div className="flex gap-3 p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-white/30 py-3 text-sm">取消</button>
          <button type="button" disabled={Boolean(error)} onClick={capture} className="flex-1 rounded-md bg-yellow-400 py-3 text-sm font-bold text-gray-950 disabled:opacity-50">拍照并预览</button>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ title, value, onChange, onOpenCamera }) {
  const inputRef = useRef(null)

  const selectFile = async (file) => {
    if (!file?.type.startsWith('image/')) return
    onChange({ original: file, cropped: await cropToA4(file) })
  }

  const downloadCropped = () => {
    const url = URL.createObjectURL(value.cropped)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title}-A4裁切效果.jpg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-lg border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--ui-title)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">单张完整 A4 图片</p>
        </div>
        {value ? <button type="button" onClick={() => onChange(null)} className="text-sm text-[var(--ui-primary)]">重新选择</button> : null}
      </div>
      {value ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <figure>
              <figcaption className="mb-2 text-center text-xs font-medium text-[var(--ui-muted)]">原始照片</figcaption>
              <ImagePreview file={value.original} alt={`${title}原始照片`} className="aspect-[1/1.414] w-full rounded border bg-gray-100 object-contain" />
            </figure>
            <figure>
              <figcaption className="mb-2 text-center text-xs font-medium text-[var(--ui-primary)]">黄色框精确裁切结果</figcaption>
              <ImagePreview file={value.cropped} alt={`${title}裁切结果`} className="aspect-[1/1.414] w-full rounded border border-blue-300 bg-gray-100 object-contain" />
            </figure>
          </div>
          <button type="button" onClick={downloadCropped} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--ui-primary)] py-2 text-sm font-medium text-[var(--ui-primary)]">
            <Download size={17} />下载裁切结果
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] text-sm font-medium">
            <ImagePlus size={23} />从相册上传
          </button>
          <button type="button" onClick={onOpenCamera} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg bg-[var(--ui-primary)] text-sm font-medium text-white">
            <Camera size={23} />拍照上传
          </button>
        </div>
      )}
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
    setMessage('测试流程已完成。请下载两张裁切结果并发送给我审查。')
  }

  return (
    <main className="min-h-screen bg-[var(--ui-page)] px-4 py-8">
      <div className="mx-auto max-w-lg">
        <header className="mb-6">
          <p className="text-sm font-semibold text-[var(--ui-primary)]">拍照上传流程测试</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--ui-title)]">学员资料拍照上传</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">本页只测试手机拍照、黄色 A4 引导框和图片预览，不保存正式资料。</p>
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
