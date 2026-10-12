// Run against npm run dev. Uses isolated fixture data, never real Supabase data.
// PLAYWRIGHT_MODULE may point to a preinstalled Playwright index.mjs.
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const appUrl = process.env.ZIP_TEST_URL || 'http://127.0.0.1:5173'
const outputDir = path.join(tmpdir(), 'student-system-zip-qa')
await mkdir(outputDir, { recursive: true })
let mode = 'retry'
const requests = new Map()
const fileServer = http.createServer((req, res) => {
  const name = req.url.slice(1)
  requests.set(name, (requests.get(name) || 0) + 1)
  res.setHeader('Access-Control-Allow-Origin', '*')
  if ((mode === 'retry' && name === 'b-health' && requests.get(name) === 1) ||
      (mode === 'missing' && name === 'b-health')) {
    res.writeHead(mode === 'missing' ? 404 : 503)
    return res.end('fixture failure')
  }
  if (mode === 'hold' && name === 'b-health') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' })
    res.flushHeaders()
    return
  }
  const slow = mode === 'slow' && name === 'b-health'
  const body = Buffer.from(slow ? 'x'.repeat(48) : `fixture:${name}`)
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': body.length })
  if (!slow) return res.end(body)
  res.flushHeaders()
  let offset = 0
  const timer = setInterval(() => {
    res.write(body.subarray(offset, ++offset))
    if (offset === body.length) { clearInterval(timer); res.end() }
  }, 1000)
  res.on('close', () => clearInterval(timer))
})
await new Promise(resolve => fileServer.listen(0, '127.0.0.1', resolve))
const filesUrl = `http://127.0.0.1:${fileServer.address().port}`
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] })
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()) })
const data = {
  classes: [{ id: 'class-a', name: '弱网测试班' }, { id: 'class-b', name: '其他班' }],
  enrollments: ['a', 'b'].map(id => ({ id, class_id: 'class-a', profiles: { real_name: `学员${id.toUpperCase()}` } })),
  class_document_submissions: ['a', 'b'].map(id => ({ id: `submission-${id}`, enrollment_id: id,
    class_id: 'class-a', match_status: 'matched', updated_at: '2026-10-12',
    criminal_record_path: `${id}-criminal`, health_declaration_path: `${id}-health` })),
}
const mockClient = `const data = ${JSON.stringify(data)};
export const supabaseAdmin = {
 auth: { getUser: async () => ({data:{user:{id:'fixture-admin'}}}) },
 from(table) { const q = { select(){return q}, eq(){return q}, in(){return q}, order(){return q},
 then(resolve, reject){return Promise.resolve({data:data[table] || []}).then(resolve,reject)} }; return q },
 storage: {from(){return {createSignedUrl: async (p) => ({data:{signedUrl:${JSON.stringify(filesUrl)}+'/'+p}})}}}
};`
await page.route('**/src/lib/supabase.js*', route => route.fulfill({ contentType: 'application/javascript', body: mockClient }))
await page.route('**/__zip-qa', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>资料收集弱网验证</title><link rel="stylesheet" href="/src/index.css"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {default:Page}=await import('/src/pages/admin/ClassDocumentManagement.jsx');ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Page));</script></body></html>` }))

const waitText = text => page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 })
async function reset(nextMode) {
  mode = nextMode
  requests.clear()
  await page.goto(`${appUrl}/__zip-qa`)
  await page.getByRole('button', { name: '下载全班 ZIP', exact: true }).waitFor()
}
async function saveAndInspect(clickName, slow = false) {
  const downloaded = page.waitForEvent('download', { timeout: 65000 })
  await page.getByRole('button', { name: clickName, exact: true }).click()
  const download = await downloaded
  assert.equal(download.suggestedFilename(), '弱网测试班.zip')
  const target = path.join(outputDir, 'fixture.zip')
  await download.saveAs(target)
  const zip = await JSZip.loadAsync(await readFile(target))
  const files = Object.keys(zip.files).filter(name => !zip.files[name].dir)
  assert.equal(files.length, 4)
  for (const id of ['a', 'b']) for (const [kind, suffix] of [['criminal', '无犯罪记录'], ['health', '身体健康申明']]) {
    const name = `学员${id.toUpperCase()}`
    const entry = zip.file(`弱网测试班/${name}/${name}+${suffix}.jpg`)
    assert.ok(entry)
    assert.equal(await entry.async('string'), slow && id === 'b' && kind === 'health' ? 'x'.repeat(48) : `fixture:${id}-${kind}`)
  }
}

try {
  await reset('retry')
  await saveAndInspect('下载全班 ZIP')
  assert.equal(requests.get('b-health'), 2)
  assert.equal(requests.get('a-criminal'), 1)
  console.log('PASS: transient failure retries; complete ZIP content and directory structure verified')
  const savedRequests = [...requests]
  await saveAndInspect('再次保存 ZIP')
  assert.deepEqual([...requests], savedRequests)
  console.log('PASS: saving generated ZIP again does not fetch files')

  await reset('missing')
  await page.getByRole('button', { name: '下载全班 ZIP', exact: true }).click()
  await waitText('已保留 3/4 份资料')
  await page.screenshot({ path: path.join(outputDir, 'desktop-retry.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(outputDir, 'mobile-retry.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  mode = 'normal'
  await saveAndInspect('继续下载缺失资料')
  assert.equal(requests.get('a-criminal'), 1)
  assert.equal(requests.get('a-health'), 1)
  assert.equal(requests.get('b-criminal'), 1)
  assert.equal(requests.get('b-health'), 2)
  console.log('PASS: failure preserves 3 successful files and retry fetches only the missing file; mobile layout fits')

  await reset('hold')
  await page.getByRole('button', { name: '下载全班 ZIP', exact: true }).click()
  await waitText('已完成 3/4 份资料')
  assert.equal(await page.getByRole('combobox').first().isDisabled(), true)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await waitText('已暂停，已保留 3/4')
  mode = 'normal'
  await saveAndInspect('继续下载缺失资料')
  assert.equal(requests.get('a-criminal'), 1)
  console.log('PASS: pause aborts active work and resumes from cached completed files')

  await reset('normal')
  await context.setOffline(true)
  await page.getByRole('button', { name: '下载全班 ZIP', exact: true }).click()
  await waitText('网络已断开，连接恢复后自动继续')
  assert.equal(requests.size, 0)
  const offlineDownload = page.waitForEvent('download')
  await context.setOffline(false)
  await offlineDownload
  await waitText('完整 ZIP 已生成')
  console.log('PASS: offline waiting resumes automatically when network returns')

  await reset('slow')
  const start = Date.now()
  await saveAndInspect('下载全班 ZIP', true)
  assert.ok(Date.now() - start > 45000)
  assert.equal(requests.get('b-health'), 1)
  console.log('PASS: continuous 48-second transfer survives the old 45-second limit without retries')
  assert.deepEqual(errors, [])
  console.log(`PASS: no page runtime errors; screenshots in ${outputDir}`)
} catch (error) {
  console.error('Runtime errors:', errors)
  console.error('Page text:', await page.locator('body').innerText())
  await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true })
  throw error
} finally {
  await browser.close()
  fileServer.closeAllConnections()
  await new Promise(resolve => fileServer.close(resolve))
}
