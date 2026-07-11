import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CredentialsDashboardPage } from '../pages/CredentialsDashboardPage';
import { waitForShareEmail, extractShareLinks } from '../utils/emailVerifier';
import { TEST_ACCOUNT, SHARE_RECIPIENT_EMAIL, EXPECTED_EMAIL } from '../fixtures/testData';

test('share transcript via email and verify delivery via IMAP', async ({ page }) => {
  // Increase test timeout to accommodate email delivery time
  test.setTimeout(120_000);

  // Record the time just before we trigger the share, so IMAP only looks
  // at mail that arrived after this point (avoids matching old emails).
  const shareTriggerTime = new Date(Date.now() - 60_000);

  const loginPage = new LoginPage(page);
  const dashboard = new CredentialsDashboardPage(page);

  // ---------- UI flow: login + share ----------
  await loginPage.open();
  await loginPage.login(TEST_ACCOUNT.username, TEST_ACCOUNT.password);

  await dashboard.openShareDialogForFirstRow();
  await dashboard.shareModal.shareViaEmail(SHARE_RECIPIENT_EMAIL);

  await dashboard.expectShareSuccessToast();
  await dashboard.closeToast();

  // ---------- IMAP verification ----------
  const email = await waitForShareEmail({
    host: 'imap.gmail.com',
    user: process.env.GMAIL_USER!,
    pass: process.env.GMAIL_APP_PASSWORD!,
    fromContains: EXPECTED_EMAIL.fromContains,
    subjectContains: EXPECTED_EMAIL.subjectContains,
    since: shareTriggerTime,
    timeoutMs: 90_000,
    pollIntervalMs: 5_000,
  });

  // --- Subject & sender ---
  expect(email.from.toLowerCase()).toContain(EXPECTED_EMAIL.fromContains);
  expect(email.subject).toContain(EXPECTED_EMAIL.studentName);
  expect(email.subject.toLowerCase()).toContain(EXPECTED_EMAIL.subjectContains);

  // --- Body content: institution + student name ---
  const body = email.text || email.html;
  expect(body).toBeTruthy();
  expect(body).toContain(EXPECTED_EMAIL.institution);
  expect(body).toContain(EXPECTED_EMAIL.studentName);
  expect(body).toContain(EXPECTED_EMAIL.senderContactEmail);

  // --- Links: download + verify + matching trackId ---
  const links = extractShareLinks(body);

  expect(links.downloadUrl, 'Download Transcript link should be present').not.toBeNull();
  expect(links.verifyUrl, 'Verify-credentials link should be present').not.toBeNull();
  expect(links.trackId, 'trackId GUID should be extractable').not.toBeNull();

  expect(links.downloadUrl).toContain('lockeruat.glcredentials.com/report/api/share-credentials/view/');
  expect(links.verifyUrl).toContain('lockeruat.glcredentials.com/verify-credentials');
  expect(links.verifyUrl).toContain(`trackId=${links.trackId}`);

  // --- Optional: confirm the download link actually resolves ---
  const downloadResponse = await page.request.get(links.downloadUrl!);
  expect(downloadResponse.status(), 'Download link should resolve successfully').toBeLessThan(400);
});