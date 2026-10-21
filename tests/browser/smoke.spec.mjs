import { expect, test } from '@playwright/test'

const supabaseOrigin = 'https://zmhbrqkzvgajmvhhorba.supabase.co'
const mockUserId = '11111111-1111-4111-8111-111111111111'
const mockWorkspaceId = '22222222-2222-4222-8222-222222222222'
const mockItemId = '33333333-3333-4333-8333-333333333333'

async function mockPublicData(page) {
  await page.route(`${supabaseOrigin}/rest/v1/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    })
  })
}

async function mockAuthenticatedWorkshop(page, resolveResponse = () => undefined) {
  await page.addInitScript(({ userId }) => {
    const encode = (value) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const now = Math.floor(Date.now() / 1000)
    const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.browser-smoke`
    const session = {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'browser-smoke-refresh',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'browser-smoke@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
      },
    }
    localStorage.setItem('sb-zmhbrqkzvgajmvhhorba-auth-token', JSON.stringify(session))
  }, { userId: mockUserId })

  await page.route(`${supabaseOrigin}/rest/v1/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/workspaces')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: mockWorkspaceId, name: 'Calibre & Co.', slug: 'calibre-co', owner_id: mockUserId }),
      })
      return
    }
    if (url.pathname.endsWith('/workspace_members')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workspace_id: mockWorkspaceId, user_id: mockUserId, role: 'owner' }),
      })
      return
    }

    const override = resolveResponse(url, route.request())
    if (override !== undefined) {
      const body = JSON.stringify(override)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': Array.isArray(override) ? `0-${Math.max(0, override.length - 1)}/${override.length}` : '0-0/1' },
        body,
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    })
  })
}

async function expectNoDocumentOverflow(page) {
  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1)
}

test('customer home navigates to an empty catalogue without touching live data', async ({ page }) => {
  await mockPublicData(page)
  await page.goto('/#/home')

  await expect(page.getByRole('heading', { name: 'Vintage watches deserve better records.' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore the catalogue' }).click()
  await expect(page).toHaveURL(/#\/catalogue$/)
  await expect(page.getByRole('heading', { name: 'Vintage watches. Properly documented.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The first watches are being prepared.' })).toBeVisible()
})

test('workshop OTP sign-in reaches code entry without sending a real email', async ({ page }) => {
  await page.route(`${supabaseOrigin}/auth/v1/otp`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in to Calibre' })).toBeVisible()

  await page.getByLabel('Email').fill('browser-smoke@example.com')
  await page.getByRole('button', { name: 'Send verification code' }).click()

  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  const verifyButton = page.getByRole('button', { name: 'Verify and sign in' })
  await expect(verifyButton).toBeDisabled()
  await page.getByLabel('Verification code').fill('12345678')
  await expect(verifyButton).toBeEnabled()
})

test('customer home stays inside a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPublicData(page)
  await page.goto('/#/home')
  await expect(page.getByRole('heading', { name: 'Vintage watches deserve better records.' })).toBeVisible()
  await expectNoDocumentOverflow(page)
})

test('authenticated Inventory renders inside a 390 px phone viewport without live writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAuthenticatedWorkshop(page)
  await page.goto('/#/items')

  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.locator('.inventory-hub-page.inventory-v2-page')).toBeVisible()
  await expectNoDocumentOverflow(page)
})

test('authenticated Workbench stays inside a 390 px phone viewport with mocked summaries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAuthenticatedWorkshop(page, (url) => {
    if (url.pathname.endsWith('/rpc/workbench_status_counts')) {
      return { active: 0, ready: 0, on_bench: 0, waiting: 0, qc: 0, queued: 0, complete: 0 }
    }
    if (url.pathname.endsWith('/rpc/workbench_attention_snapshot')) {
      return { work: [], needs: [], failedQc: [], evidenceCount: 0 }
    }
    return undefined
  })
  await page.goto('/#/workbench')

  await expect(page.getByRole('heading', { name: 'Workbench' })).toBeVisible()
  await expect(page.locator('.workbench-v2-page')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search workbench' })).toBeVisible()
  await expectNoDocumentOverflow(page)
})

test('authenticated Item workspace renders a realistic record inside a 390 px phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAuthenticatedWorkshop(page, (url) => {
    if (url.pathname.endsWith('/items')) {
      return {
        id: mockItemId,
        item_number: 42,
        type: 'watch',
        purpose: 'resale',
        status: 'preparing',
        title: 'Omega Seamaster Test Record',
        notes: 'Mock browser record only.',
        acquired_at: '2026-10-01',
        created_at: '2026-10-01T00:00:00Z',
      }
    }
    if (url.pathname.endsWith('/item_identity')) {
      return {
        maker: 'Omega',
        model: 'Seamaster',
        reference: 'Mock-42',
        serial: 'TEST00042',
        era: '1960s',
        country: 'Switzerland',
        materials: 'Stainless steel',
        dimensions_text: '35 mm',
        dial_markings: 'Omega Seamaster',
        case_markings: 'Mock case',
        movement_markings: 'Mock calibre',
        notes: 'Browser smoke fixture',
      }
    }
    if (url.pathname.endsWith('/workbench_jobs')) return []
    if (url.pathname.endsWith('/valuations')) {
      return { low_value: 400, expected_value: 550, high_value: 700, target_value: 600, minimum_value: 450, currency: 'AUD', confidence: 'medium', basis: 'Mock browser fixture' }
    }
    if (url.pathname.endsWith('/cost_entries')) return []
    return undefined
  })
  await page.goto(`/#/items/${mockItemId}`)

  await expect(page.getByRole('heading', { name: 'Omega Seamaster Test Record' })).toBeVisible()
  await expect(page.locator('.item-v2-page')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Item sections' })).toBeVisible()
  await expectNoDocumentOverflow(page)
})
