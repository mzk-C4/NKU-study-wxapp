// Read-only GET probes. Run after the website owner deploys the local dist.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = new URL('../dist/', import.meta.url)
const html = await readFile(new URL('index.html', root), 'utf8')
const assets = [...html.matchAll(/(?:src|href)="\/campus-map\/(assets\/[^"?#]+)"/g)].map(match => match[1])
assert(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')), 'Build dist first')
const files = ['index.html', ...assets, 'credits.html', 'LICENSE-three.txt', 'nankai-emblem-source.png']
const mime = { html: 'text/html', js: '(?:text|application)/(?:java|ecma)script', css: 'text/css', png: 'image/png', txt: 'text/plain' }
let failures = 0
for (const file of files) {
  try {
    const response = await fetch('https://nkustudy.top/campus-map/' + (file === 'index.html' ? '' : file), {
      redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' }
    })
    assert.equal(response.status, 200, `HTTP ${response.status}`)
    const extension = file.split('.').at(-1)
    assert.match(response.headers.get('content-type') || '', new RegExp(mime[extension], 'i'), 'Wrong MIME type')
    if (extension === 'html') assert.match(response.headers.get('cache-control') || '', /(?:no-cache|no-store|max-age=(?:0|[1-9]\d{0,2}))(?:\D|$)/i, 'HTML must revalidate or have a short cache')
    const expected = await readFile(new URL(file, root))
    const actual = Buffer.from(await response.arrayBuffer())
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    assert.equal(hash(actual), hash(expected), 'Content differs from this reviewed build')
    console.log(`PASS ${file}`)
  } catch (error) { failures++; console.error(`FAIL ${file}: ${error.message}`) }
}
if (failures) process.exitCode = 1
else console.log('Static deployment verified; real WeChat acceptance is still required.')
