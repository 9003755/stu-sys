import { QRCodeSVG } from 'qrcode.react'
import { buildAppUrl } from '../../lib/siteUrls'

export default function CameraUploadTestQr() {
  const url = buildAppUrl('/camera-upload-test')

  return (
    <main className="min-h-screen bg-[var(--ui-page)] p-6">
      <section className="mx-auto max-w-md rounded-lg bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[var(--ui-title)]">拍照上传测试二维码</h1>
        <p className="mt-2 text-sm text-[var(--ui-muted)]">扫码进入手机摄像头测试页</p>
        <div className="my-7 flex justify-center">
          <QRCodeSVG value={url} size={230} level="H" includeMargin />
        </div>
        <p className="break-all rounded bg-gray-100 p-3 text-xs text-gray-600">{url}</p>
      </section>
    </main>
  )
}
