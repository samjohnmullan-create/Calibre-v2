import { expect, test } from '@playwright/test'

const supabaseOrigin = 'https://zmhbrqkzvgajmvhhorba.supabase.co'
const mockUserId = '11111111-1111-4111-8111-111111111111'
const mockWorkspaceId = '22222222-2222-4222-8222-222222222222'

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

async function mockAuthenticatedWorkshop(page) {
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    })
  })
})

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

  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1)
})

test('authenticated Inventory renders inside a 390 px phone viewport without live writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAuthenticatedWorkshop(page)
  await page.goto('/#/items')

  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.locator('.inventory-hub-page.inventory-v2-page')).toBeVisible()

  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1)
})
