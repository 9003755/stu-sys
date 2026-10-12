import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { downloadWithRetry } from '../src/lib/resilientDownload.js'

const quickOptions = { idleTimeoutMs: 100, urlTimeoutMs: 100, retryDelayMs: 1 }

function flowingResponse(parts, intervalMs, onCancel = () => {}) {
  let timer
  const stream = new ReadableStream({
    start(controller) {
      let index = 0
      timer = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(parts[index++]))
        if (index === parts.length) {
          clearInterval(timer)
          controller.close()
        }
      }, intervalMs)
    },
    cancel() {
      clearInterval(timer)
      onCancel()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Length': String(parts.join('').length), 'Content-Type': 'image/jpeg' },
  })
}

function stalledResponse(onCancel = () => {}) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1]))
    },
    cancel: onCancel,
  }))
}

function mockNetwork(t, initiallyOnline) {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const browser = new EventTarget()
  const navigator = { onLine: initiallyOnline }
  const listeners = new Map()
  const add = browser.addEventListener.bind(browser)
  const remove = browser.removeEventListener.bind(browser)
  browser.addEventListener = (type, callback, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(callback)
    add(type, callback, options)
  }
  browser.removeEventListener = (type, callback, options) => {
    listeners.get(type)?.delete(callback)
    remove(type, callback, options)
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator })
  t.after(() => {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator)
    else delete globalThis.navigator
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
    else delete globalThis.window
  })
  return {
    setOnline(online) {
      navigator.onLine = online
      browser.dispatchEvent(new Event(online ? 'online' : 'offline'))
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0)
    },
  }
}

test('a continuously flowing file may take longer than the idle timeout', async () => {
  const progress = []
  const start = Date.now()
  const blob = await downloadWithRetry(async () => 'file', {
    ...quickOptions,
    idleTimeoutMs: 120,
    onProgress: value => progress.push(value),
    fetchImpl: async () => flowingResponse(Array(10).fill('abc'), 25),
  })
  assert.ok(Date.now() - start > 120)
  assert.equal(await blob.text(), 'abc'.repeat(10))
  assert.equal(blob.type, 'image/jpeg')
  assert.deepEqual(progress.at(-1), { received: 30, total: 30 })
})

test('a stalled stream is canceled and retried with a fresh URL', async () => {
  let canceled = 0
  const urls = []
  const statuses = []
  let signed = 0
  const blob = await downloadWithRetry(async () => `signed-${++signed}`, {
    ...quickOptions,
    idleTimeoutMs: 40,
    onStatus: value => statuses.push(value),
    fetchImpl: async url => {
      urls.push(url)
      return urls.length === 1 ? stalledResponse(() => canceled++) : new Response('complete')
    },
  })
  assert.deepEqual(urls, ['signed-1', 'signed-2'])
  assert.equal(canceled, 1)
  assert.equal(await blob.text(), 'complete')
  assert.equal(statuses.filter(value => value.phase === 'retry').length, 1)
})

test('URL generation timeout retries even if the provider ignores cancellation', async () => {
  let calls = 0
  let firstSignal
  const blob = await downloadWithRetry(async ({ signal }) => {
    calls++
    if (calls === 1) {
      firstSignal = signal
      return new Promise(() => {})
    }
    return 'fresh'
  }, {
    ...quickOptions,
    urlTimeoutMs: 30,
    fetchImpl: async () => new Response('ok'),
  })
  assert.equal(calls, 2)
  assert.equal(firstSignal.aborted, true)
  assert.equal(await blob.text(), 'ok')
})

test('temporary signed URL errors and expired URLs are retried', async () => {
  let signed = 0
  const urls = []
  const blob = await downloadWithRetry(async () => {
    signed++
    if (signed === 1) throw Object.assign(new Error('unavailable'), { statusCode: '503' })
    return `signed-${signed}`
  }, {
    ...quickOptions,
    fetchImpl: async url => {
      urls.push(url)
      return urls.length === 1 ? new Response('', { status: 401 }) : new Response('ok')
    },
  })
  assert.equal(signed, 3)
  assert.deepEqual(urls, ['signed-2', 'signed-3'])
  assert.equal(await blob.text(), 'ok')
})

for (const status of [403, 408, 429, 500, 503]) {
  test(`HTTP ${status} can recover on retry`, async () => {
    let calls = 0
    const blob = await downloadWithRetry(async () => 'file', {
      ...quickOptions,
      fetchImpl: async () => ++calls === 1 ? new Response('', { status }) : new Response('ok'),
    })
    assert.equal(calls, 2)
    assert.equal(await blob.text(), 'ok')
  })
}

test('a network fetch failure retries', async () => {
  let calls = 0
  const blob = await downloadWithRetry(async () => 'file', {
    ...quickOptions,
    fetchImpl: async () => {
      if (++calls === 1) throw new TypeError('Failed to fetch')
      return new Response('ok')
    },
  })
  assert.equal(calls, 2)
  assert.equal(await blob.text(), 'ok')
})

for (const source of ['url', 'fetch']) {
  test(`a permanent 404 from ${source} fails without retries`, async () => {
    let signed = 0
    let fetched = 0
    await assert.rejects(downloadWithRetry(async () => {
      signed++
      if (source === 'url') throw Object.assign(new Error('missing'), { statusCode: '404' })
      return 'file'
    }, {
      ...quickOptions,
      fetchImpl: async () => {
        fetched++
        return new Response('', { status: 404 })
      },
    }), error => Number(error.status ?? error.statusCode) === 404)
    assert.equal(signed, 1)
    assert.equal(fetched, source === 'url' ? 0 : 1)
  })
}

test('exhausted retries report the final error and stop', async () => {
  let calls = 0
  await assert.rejects(downloadWithRetry(async () => 'file', {
    ...quickOptions,
    maxAttempts: 3,
    fetchImpl: async () => {
      calls++
      throw new TypeError(`offline upstream ${calls}`)
    },
  }), /offline upstream 3/)
  assert.equal(calls, 3)
})

test('a truncated response retries rather than silently corrupting the ZIP', async () => {
  let calls = 0
  const blob = await downloadWithRetry(async () => 'file', {
    ...quickOptions,
    fetchImpl: async () => new Response(++calls === 1 ? 'a' : 'abc', {
      headers: { 'Content-Length': '3' },
    }),
  })
  assert.equal(calls, 2)
  assert.equal(await blob.text(), 'abc')
})

test('an empty response fails after exhausting retries', async () => {
  let calls = 0
  await assert.rejects(downloadWithRetry(async () => 'file', {
    ...quickOptions,
    maxAttempts: 2,
    fetchImpl: async () => {
      calls++
      return new Response('')
    },
  }), error => error.code === 'DOWNLOAD_EMPTY')
  assert.equal(calls, 2)
})

test('encoded content length is not compared to the decoded bytes', async () => {
  const blob = await downloadWithRetry(async () => 'file', {
    ...quickOptions,
    fetchImpl: async () => new Response('decoded content', {
      headers: { 'Content-Length': '3', 'Content-Encoding': 'gzip' },
    }),
  })
  assert.equal(await blob.text(), 'decoded content')
})

test('the no-stream fallback allows more than the streaming idle timeout', async () => {
  const blob = await downloadWithRetry(async () => 'file', {
    ...quickOptions,
    idleTimeoutMs: 20,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      body: null,
      blob: async () => {
        await delay(60)
        return new Blob(['ok'])
      },
    }),
  })
  assert.equal(await blob.text(), 'ok')
})

test('already canceled downloads do not generate a URL', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  await assert.rejects(downloadWithRetry(async () => {
    calls++
    return 'file'
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 0)
})

test('canceling a stalled download closes the reader and stops retries', async () => {
  const controller = new AbortController()
  let canceled = 0
  let calls = 0
  const download = downloadWithRetry(async () => 'file', {
    ...quickOptions,
    signal: controller.signal,
    fetchImpl: async () => {
      calls++
      return stalledResponse(() => canceled++)
    },
  })
  setTimeout(() => controller.abort(), 20)
  await assert.rejects(download, { name: 'AbortError' })
  assert.equal(calls, 1)
  assert.equal(canceled, 1)
})

test('canceling during retry backoff is immediate', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(downloadWithRetry(async () => 'file', {
    ...quickOptions,
    signal: controller.signal,
    retryDelayMs: 10000,
    onStatus: ({ phase }) => {
      if (phase === 'retry') controller.abort()
    },
    fetchImpl: async () => {
      calls++
      throw new TypeError('Failed to fetch')
    },
  }), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('offline work waits for reconnection without consuming an attempt', async t => {
  const network = mockNetwork(t, false)
  let calls = 0
  const phases = []
  const download = downloadWithRetry(async () => {
    calls++
    return 'file'
  }, {
    ...quickOptions,
    maxAttempts: 1,
    onStatus: ({ phase }) => phases.push(phase),
    fetchImpl: async () => new Response('ok'),
  })
  await delay(20)
  assert.equal(calls, 0)
  network.setOnline(true)
  assert.equal(await (await download).text(), 'ok')
  assert.equal(calls, 1)
  assert.deepEqual(phases, ['offline', 'download'])
  assert.equal(network.listenerCount(), 0)
})

test('canceling an offline wait removes its listeners', async t => {
  const network = mockNetwork(t, false)
  const controller = new AbortController()
  const download = downloadWithRetry(async () => 'file', { signal: controller.signal })
  controller.abort()
  await assert.rejects(download, { name: 'AbortError' })
  assert.equal(network.listenerCount(), 0)
})

test('connection loss pauses and restarts the interrupted attempt after reconnection', async t => {
  const network = mockNetwork(t, true)
  let calls = 0
  let canceled = 0
  const phases = []
  const download = downloadWithRetry(async () => 'file', {
    ...quickOptions,
    maxAttempts: 1,
    onStatus: ({ phase }) => phases.push(phase),
    fetchImpl: async () => {
      calls++
      return calls === 1 ? stalledResponse(() => canceled++) : new Response('ok')
    },
  })
  await delay(20)
  network.setOnline(false)
  await delay(20)
  assert.equal(calls, 1)
  network.setOnline(true)
  assert.equal(await (await download).text(), 'ok')
  assert.equal(calls, 2)
  assert.equal(canceled, 1)
  assert.deepEqual(phases, ['download', 'offline', 'download'])
  assert.equal(network.listenerCount(), 0)
})
