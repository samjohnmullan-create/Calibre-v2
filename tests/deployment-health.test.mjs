import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import http from 'node:http'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const liveSha = '1234567890abcdef1234567890abcdef12345678'

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/deploy-meta.json')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ app: 'calibre-v2', commit: liveSha }))
      return
    }

    if (req.url?.startsWith('/auth/v1/health')) {
      if (req.headers.apikey !== 'test-publishable-key') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: 'invalid API key' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ name: 'GoTrue', version: 'test' }))
      return
    }

    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html><body><div id="root"></div></body></html>')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

test('post-deploy health passes when site fingerprint and backend are current', async (t) => {
  const { server, url } = await startServer()
  t.after(() => server.close())

  const { stdout } = await execFileAsync(process.execPath, ['scripts/post-deploy-health.mjs'], {
    env: {
      ...process.env,
      SITE_URL: url,
      EXPECTED_SHA: liveSha,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      HEALTH_ATTEMPTS: '1',
      HEALTH_DELAY_MS: '0',
    },
  })

  assert.match(stdout, /Production health passed/)
})

test('post-deploy health rejects a stale live commit', async (t) => {
  const { server, url } = await startServer()
  t.after(() => server.close())

  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/post-deploy-health.mjs'], {
      env: {
        ...process.env,
        SITE_URL: url,
        EXPECTED_SHA: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        SUPABASE_URL: url,
        SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
        HEALTH_ATTEMPTS: '1',
        HEALTH_DELAY_MS: '0',
      },
    }),
    (error) => {
      assert.match(`${error.stdout || ''}${error.stderr || ''}`, /stale release/)
      return true
    },
  )
})
