const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const siteUrl = required('SITE_URL').replace(/\/$/, '')
const expectedSha = required('EXPECTED_SHA').toLowerCase()
const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '')
const supabaseKey = required('SUPABASE_PUBLISHABLE_KEY')
const attempts = Math.max(1, Number(process.env.HEALTH_ATTEMPTS || 12))
const delayMs = Math.max(0, Number(process.env.HEALTH_DELAY_MS || 5000))

if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error('EXPECTED_SHA must be a full 40-character commit SHA')
}

async function checkedFetch(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
    ...options,
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return response
}

async function checkSite() {
  const url = `${siteUrl}/?__calibre_health=${Date.now()}`
  const response = await checkedFetch(url, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  const html = await response.text()
  if (!/id=["']root["']/.test(html)) {
    throw new Error(`${siteUrl} returned HTML without the Calibre root mount`)
  }
}

async function checkDeploymentFingerprint() {
  const url = `${siteUrl}/deploy-meta.json?__calibre_health=${Date.now()}`
  const response = await checkedFetch(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  const metadata = await response.json()
  const liveSha = String(metadata?.commit || '').toLowerCase()
  if (liveSha !== expectedSha) {
    throw new Error(`stale release: expected ${expectedSha}, live site reports ${liveSha || 'no commit'}`)
  }
}

async function checkSupabase() {
  const response = await checkedFetch(`${supabaseUrl}/auth/v1/health`, {
    headers: {
      apikey: supabaseKey,
      accept: 'application/json',
    },
  })
  const health = await response.json()
  if (!health || typeof health !== 'object') {
    throw new Error('Supabase auth health endpoint returned an invalid response')
  }
}

let lastError
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await checkSite()
    await checkDeploymentFingerprint()
    await checkSupabase()
    console.log(`Production health passed for ${siteUrl} at ${expectedSha}`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.error(`Health attempt ${attempt}/${attempts} failed: ${error.message}`)
    if (attempt < attempts) await sleep(delayMs)
  }
}

throw lastError
