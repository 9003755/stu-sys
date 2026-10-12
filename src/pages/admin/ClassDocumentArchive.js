import JSZip from 'jszip'

export const safeArchiveName = (value) => String(value || '未命名').replace(/[\\/:*?"<>|]/g, '_')

// Cache only inside the mounted collection page. Versions invalidate replaced
// documents even when Storage reuses their paths; another class starts fresh.
export function prepareClassArchive(previous, classId, className, items) {
  const signature = JSON.stringify([classId, className, items])
  if (previous?.signature === signature) return previous
  const blobs = new Map()
  if (previous?.classId === classId) {
    for (const item of items) {
      if (previous.blobs.has(item.key)) blobs.set(item.key, previous.blobs.get(item.key))
    }
  }
  return { classId, className, signature, items, blobs, concurrency: 2, zipBlob: null }
}

export async function downloadClassArchive(session, { downloadFile, signal, onProgress }) {
  const pending = session.items.filter((item) => !session.blobs.has(item.key))
  const active = new Map()
  const failures = []
  let nextIndex = 0
  let storedBytes = [...session.blobs.values()].reduce((sum, blob) => sum + blob.size, 0)
  const emit = () => onProgress?.({
    completed: session.blobs.size,
    total: session.items.length,
    bytes: storedBytes + [...active.values()].reduce((sum, item) => sum + (item.bytes || 0), 0),
    active: [...active.values()],
  })
  emit()
  const worker = async (workerIndex) => {
    while (!signal.aborted && nextIndex < pending.length) {
      // After weak-network retries, give the remaining worker all bandwidth.
      if (workerIndex >= session.concurrency) return
      const item = pending[nextIndex++]
      active.set(item.key, { label: item.label, phase: 'download', bytes: 0 })
      emit()
      try {
        const blob = await downloadFile(item, {
          signal,
          onProgress: (progress) => {
            active.set(item.key, { ...active.get(item.key), bytes: progress.received })
            emit()
          },
          onStatus: (status) => {
            if (status.phase === 'retry' || status.phase === 'offline') session.concurrency = 1
            active.set(item.key, { ...active.get(item.key), ...status })
            emit()
          },
        })
        if (signal.aborted) return
        session.blobs.set(item.key, blob)
        storedBytes += blob.size
      } catch (error) {
        if (signal.aborted) return
        failures.push({ label: item.label, message: error.message })
      } finally {
        active.delete(item.key)
        emit()
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(session.concurrency, pending.length) }, (_, index) => worker(index)))
  if (signal.aborted) throw new DOMException('下载已暂停', 'AbortError')
  return failures
}

export async function generateClassArchive(session, { signal, onProgress } = {}) {
  if (signal?.aborted) throw new DOMException('下载已暂停', 'AbortError')
  if (session.zipBlob) return session.zipBlob
  if (session.items.some((item) => !session.blobs.has(item.key))) {
    throw new Error('还有资料未下载完成，请继续下载后再生成完整 ZIP')
  }
  const zip = new JSZip()
  const root = zip.folder(safeArchiveName(session.className))
  for (const item of session.items) root.folder(item.folder).file(item.filename, session.blobs.get(item.key))
  // JPEG scans are already compressed. STORE avoids costly recompression and
  // streamFiles reduces intermediate buffering while preserving the ZIP layout.
  const blob = await new Promise((resolve, reject) => {
    const stream = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE', streamFiles: true })
    let chunks = []
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      stream.pause()
      if (error) reject(error)
      else resolve(new Blob(chunks, { type: 'application/zip' }))
      chunks = []
    }
    const onAbort = () => finish(new DOMException('下载已暂停', 'AbortError'))
    signal?.addEventListener('abort', onAbort, { once: true })
    stream.on('data', (chunk, { percent }) => {
      if (settled) return
      chunks.push(chunk)
      onProgress?.(Math.round(percent))
    })
    stream.on('error', finish)
    stream.on('end', () => finish())
    if (signal?.aborted) onAbort()
    else stream.resume()
  })
  if (signal?.aborted) throw new DOMException('下载已暂停', 'AbortError')
  session.zipBlob = blob
  session.blobs.clear()
  return blob
}
