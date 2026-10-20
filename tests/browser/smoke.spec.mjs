import { expect, test } from '@playwright/test'

const supabaseOrigin = 'https://zmhbrqkzvgajmvhhorba.supabase.co'

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
