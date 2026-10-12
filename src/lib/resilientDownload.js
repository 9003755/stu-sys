const FALLBACK_BODY_TIMEOUT_MS = 10 * 60 * 1000

function createError(message, code, retryable = true) {
  const error = new Error(message)
  error.code = code
  error.retryable = retryable
  return error
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('下载已取消', 'AbortError')
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

// Race against cancellation even when a third-party URL provider ignores signal.
function abortable(operation, signal) {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(() => {
      throwIfAborted(signal)
      return operation()
    }).then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function abortableDelay(delayMs, signal) {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortReason(signal))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isOffline() {
  return globalThis.navigator?.onLine === false
}

function networkEvents() {
  return globalThis.window || globalThis
}

async function waitUntilOnline(signal, onStatus, attempt, maxAttempts) {
  throwIfAborted(signal)
  if (!isOffline()) return
  onStatus?.({ phase: 'offline', attempt, maxAttempts })
  await new Promise((resolve, reject) => {
    const target = networkEvents()
    const cleanup = () => {
      clearInterval(poll)
      target.removeEventListener?.('online', onOnline)
      signal?.removeEventListener('abort', onAbort)
    }
    const onOnline = () => {
      if (isOffline()) return
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    // The fallback also covers browsers which miss an online event after sleep.
    const poll = setInterval(onOnline, 1000)
    target.addEventListener?.('online', onOnline)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    else onOnline()
  })
}

function canRetry(error) {
  if (error?.retryable === false) return false
  const status = Number(error?.status ?? error?.statusCode)
  if (status >= 400 && status < 500) {
    return [401, 403, 408, 429].includes(status)
  }
  return !status || status >= 500 || error?.retryable === true
}

function cancelBody(body) {
  try {
    Promise.resolve(body?.cancel()).catch(() => {})
  } catch {
    // A failed/closed reader may already have released its underlying stream.
  }
}

async function downloadAttempt(getUrl, options) {
  const { signal, onProgress, idleTimeoutMs, urlTimeoutMs, fetchImpl } = options
  const controller = new AbortController()
  const attemptSignal = controller.signal
  const target = networkEvents()
  const onAbort = () => controller.abort(abortReason(signal))
  const onOffline = () => {
    if (isOffline()) controller.abort(createError('网络已断开，等待连接恢复', 'DOWNLOAD_OFFLINE'))
  }
  let timer
  let reader
  let finished = false
  const setDeadline = (timeoutMs, message) => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(createError(message, 'DOWNLOAD_TIMEOUT')), timeoutMs)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  target.addEventListener?.('offline', onOffline)

  try {
    throwIfAborted(signal)
    onOffline()
    setDeadline(urlTimeoutMs, '获取下载链接超时')
    const url = await abortable(() => getUrl({ signal: attemptSignal }), attemptSignal)
    if (typeof url !== 'string' || !url) {
      throw createError('未获取到有效的下载链接', 'DOWNLOAD_URL_MISSING', false)
    }

    setDeadline(idleTimeoutMs, '下载长时间没有收到数据')
    const response = await abortable(() => fetchImpl(url, {
      signal: attemptSignal,
      cache: 'no-store',
    }), attemptSignal)
    if (!response.ok) {
      cancelBody(response.body)
      const error = new Error(`下载失败（HTTP ${response.status}）`)
      error.status = response.status
      throw error
    }

    const encoding = response.headers.get('content-encoding')
    const length = response.headers.get('content-length')
    const total = (!encoding || encoding.toLowerCase() === 'identity') && /^\d+$/.test(length || '')
      ? Number(length)
      : null
    onProgress?.({ received: 0, total })
    let blob

    if (response.body?.getReader) {
      reader = response.body.getReader()
      const chunks = []
      let received = 0
      setDeadline(idleTimeoutMs, '下载长时间没有收到数据')
      while (true) {
        const { done, value } = await abortable(() => reader.read(), attemptSignal)
        if (done) break
        if (value?.byteLength) {
          chunks.push(value)
          received += value.byteLength
          setDeadline(idleTimeoutMs, '下载长时间没有收到数据')
          onProgress?.({ received, total })
        }
      }
      clearTimeout(timer)
      blob = new Blob(chunks, { type: response.headers.get('content-type') || '' })
    } else {
      // Older browsers expose no readable stream, so allow a generous total time.
      setDeadline(FALLBACK_BODY_TIMEOUT_MS, '下载超时，请检查网络后重试')
      blob = await abortable(() => response.blob(), attemptSignal)
      onProgress?.({ received: blob.size, total })
    }

    throwIfAborted(attemptSignal)
    if (!blob.size) throw createError('下载到的文件为空', 'DOWNLOAD_EMPTY')
    if (total !== null && blob.size !== total) {
      throw createError('文件未完整下载，请重试', 'DOWNLOAD_INCOMPLETE')
    }
    finished = true
    return blob
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    target.removeEventListener?.('offline', onOffline)
    if (reader) {
      if (!finished) cancelBody(reader)
      try {
        reader.releaseLock()
      } catch {
        // Some browsers retain a pending read until cancellation settles.
      }
    }
  }
}

/**
 * Download one complete file. The URL is refreshed on every attempt; healthy
 * streams have no total time limit. Offline waiting does not consume retries.
 */
export async function downloadWithRetry(getUrl, {
  signal,
  onProgress,
  onStatus,
  maxAttempts = 4,
  idleTimeoutMs = 90000,
  urlTimeoutMs = 60000,
  retryDelayMs = 1500,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts 必须为正整数')
  }
  let attempt = 1
  while (attempt <= maxAttempts) {
    await waitUntilOnline(signal, onStatus, attempt, maxAttempts)
    throwIfAborted(signal)
    onStatus?.({ phase: 'download', attempt, maxAttempts })
    onProgress?.({ received: 0, total: null })
    try {
      return await downloadAttempt(getUrl, {
        signal, onProgress, idleTimeoutMs, urlTimeoutMs, fetchImpl,
      })
    } catch (error) {
      throwIfAborted(signal)
      if (!canRetry(error)) throw error
      if (error?.code === 'DOWNLOAD_OFFLINE' || isOffline()) {
        await waitUntilOnline(signal, onStatus, attempt, maxAttempts)
        continue
      }
      if (attempt === maxAttempts) throw error
      const delayMs = Math.min(retryDelayMs * (2 ** (attempt - 1)), 15000)
      onStatus?.({ phase: 'retry', attempt, maxAttempts, delayMs })
      await abortableDelay(delayMs, signal)
      attempt += 1
    }
  }
}
