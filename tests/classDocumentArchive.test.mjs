import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { prepareClassArchive, downloadClassArchive, generateClassArchive } from '../src/pages/admin/ClassDocumentArchive.js'

const items = ['a', 'b', 'c', 'd'].map(key => ({ key, path: key, folder: key, filename: `${key}.jpg`, label: key }))
const session = () => prepareClassArchive(null, 'class-a', '测试班', items)

test('retrying a failed batch reuses all successfully downloaded files', async () => {
  const archive = session()
  const calls = []
  let failing = true
  const downloadFile = async (item) => {
    calls.push(item.key)
    if (item.key === 'b' && failing) throw new Error('offline')
    return new Blob([item.key])
  }
  const options = { signal: new AbortController().signal, downloadFile }
  assert.equal((await downloadClassArchive(archive, options)).length, 1)
  assert.equal(archive.blobs.size, 3)
  await assert.rejects(generateClassArchive(archive), /还有资料未下载完成/)
  failing = false
  assert.deepEqual(await downloadClassArchive(archive, options), [])
  assert.equal(archive.blobs.size, 4)
  assert.deepEqual(calls, ['a', 'b', 'c', 'd', 'b'])
})

test('pause cancels workers and preserves completed files for the next run', async () => {
  const archive = session()
  archive.concurrency = 1
  const controller = new AbortController()
  await assert.rejects(downloadClassArchive(archive, {
    signal: controller.signal,
    downloadFile: async (item) => {
      if (item.key === 'b') controller.abort()
      return new Blob([item.key])
    },
  }), { name: 'AbortError' })
  assert.deepEqual([...archive.blobs.keys()], ['a'])
  const calls = []
  await downloadClassArchive(archive, {
    signal: new AbortController().signal,
    downloadFile: async (item) => { calls.push(item.key); return new Blob([item.key]) },
  })
  assert.deepEqual(calls, ['b', 'c', 'd'])
})

test('retry feedback reduces subsequent concurrency without leaving files unprocessed', async () => {
  const archive = session()
  const calls = []
  await downloadClassArchive(archive, {
    signal: new AbortController().signal,
    downloadFile: async (item, { onStatus }) => {
      calls.push(item.key)
      if (item.key === 'b') onStatus({ phase: 'retry' })
      await new Promise(resolve => setTimeout(resolve, 2))
      return new Blob([item.key])
    },
  })
  assert.equal(archive.concurrency, 1)
  assert.deepEqual(calls.sort(), ['a', 'b', 'c', 'd'])
  assert.equal(archive.blobs.size, 4)
})

test('updated/deleted documents invalidate cache and class switches cannot reuse it', () => {
  const archive = session()
  for (const item of items) archive.blobs.set(item.key, new Blob([item.key]))
  assert.equal(prepareClassArchive(archive, 'class-a', '测试班', items), archive)
  const changed = [{ ...items[0], key: 'a-new-version' }, items[1], items[2]]
  const refreshed = prepareClassArchive(archive, 'class-a', '测试班', changed)
  assert.deepEqual([...refreshed.blobs.keys()], ['b', 'c'])
  assert.equal(prepareClassArchive(archive, 'class-b', '其他班', items).blobs.size, 0)
})

test('progress counts successes rather than treating failures as completed', async () => {
  const archive = session()
  let lastProgress
  await downloadClassArchive(archive, {
    signal: new AbortController().signal,
    downloadFile: async (item) => {
      if (item.key === 'c') throw new Error('not found')
      return new Blob(['12345'])
    },
    onProgress: progress => { lastProgress = progress },
  })
  assert.equal(lastProgress.completed, 3)
  assert.equal(lastProgress.total, 4)
  assert.equal(lastProgress.bytes, 15)
  assert.deepEqual(lastProgress.active, [])
})

test('generated ZIP contains every file and can be saved again without rebuilding', async () => {
  const archive = session()
  // Uint8Array lets Node exercise the same JSZip streaming path without a
  // browser FileReader; the browser suite separately covers actual Blob inputs.
  for (const item of items) archive.blobs.set(item.key, new TextEncoder().encode(item.key))
  const blob = await generateClassArchive(archive)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  for (const item of items) {
    assert.equal(await zip.file(`测试班/${item.folder}/${item.filename}`).async('string'), item.key)
  }
  assert.equal(archive.blobs.size, 0)
  assert.equal(await generateClassArchive(archive), blob)
})

test('canceling ZIP generation rejects cleanly and leaves all source files resumable', async () => {
  const archive = session()
  for (const item of items) archive.blobs.set(item.key, new Uint8Array(64000))
  const controller = new AbortController()
  await assert.rejects(generateClassArchive(archive, {
    signal: controller.signal,
    onProgress: () => controller.abort(),
  }), { name: 'AbortError' })
  assert.equal(archive.zipBlob, null)
  assert.equal(archive.blobs.size, 4)
  const blob = await generateClassArchive(archive)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  assert.equal(Object.values(zip.files).filter(file => !file.dir).length, 4)
})
