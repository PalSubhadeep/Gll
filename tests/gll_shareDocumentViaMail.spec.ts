import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CredentialsDashboardPage } from '../pages/CredentialsDashboardPage';
import { waitForShareEmail } from '../utils/emailVerifier';
import { TEST_ACCOUNT, SHARE_RECIPIENT_EMAIL } from '../fixtures/testData';

test.describe.serial('Share Documents via Email and Verify via IMAP', () => {

  test('share self-upload document via email and log IMAP response', async ({ page }) => {
    test.setTimeout(150_000);
    const shareTriggerTime = new Date(Date.now() - 30_000);

    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(TEST_ACCOUNT.username, TEST_ACCOUNT.password);

    // 2. Select Self Uploads tab and click Share on the first row
    await dashboard.selectSelfUploadsTab();
    await dashboard.openShareDialogForFirstRow();

    // 3. Enter email and click share
    await dashboard.shareModal.shareViaEmail(SHARE_RECIPIENT_EMAIL);
    await dashboard.expectShareSuccessToast();
    await dashboard.closeToast();

    console.log(`Self Upload document shared to ${SHARE_RECIPIENT_EMAIL}. Waiting for email...`);

    // 4. Connect to IMAP to fetch the email
    const email = await waitForShareEmail({
      host: 'imap.gmail.com',
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
      since: shareTriggerTime,
      timeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    // 5. Log the received email details to console
    console.log('\n=============================================');
    console.log('       RECEIVED SELF UPLOAD EMAIL DETAILS    ');
    console.log('=============================================');
    console.log(`From:    ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log('------------------ TEXT BODY ----------------');
    console.log(email.text || '(No text body)');
    console.log('---------------- ATTACHMENTS ----------------');
    const attachments = email.attachments || [];
    console.log(`Count:   ${attachments.length}`);
    attachments.forEach((att: any, idx: number) => {
      console.log(`[${idx + 1}] Filename: ${att.filename} (${att.size} bytes)`);
    });
    console.log('=============================================\n');

    expect(email.subject).toBeTruthy();
  });

  test('share resume document via email and log IMAP response', async ({ page }) => {
    test.setTimeout(150_000);
    const shareTriggerTime = new Date(Date.now() - 30_000);

    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(TEST_ACCOUNT.username, TEST_ACCOUNT.password);

    // 2. Select Resumes tab and click Share on the first row
    await dashboard.selectResumesTab();
    await dashboard.openShareDialogForFirstRow();

    // 3. Enter email and click share
    await dashboard.shareModal.shareViaEmail(SHARE_RECIPIENT_EMAIL);
    await dashboard.expectShareSuccessToast();
    await dashboard.closeToast();

    console.log(`Resume document shared to ${SHARE_RECIPIENT_EMAIL}. Waiting for email...`);

    // 4. Connect to IMAP to fetch the email
    const email = await waitForShareEmail({
      host: 'imap.gmail.com',
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
      since: shareTriggerTime,
      timeoutMs: 120_000,
      pollIntervalMs: 5_000,
    });

    // 5. Log the received email details to console
    console.log('\n=============================================');
    console.log('         RECEIVED RESUME EMAIL DETAILS       ');
    console.log('=============================================');
    console.log(`From:    ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log('------------------ TEXT BODY ----------------');
    console.log(email.text || '(No text body)');
    console.log('---------------- ATTACHMENTS ----------------');
    const attachments = email.attachments || [];
    console.log(`Count:   ${attachments.length}`);
    attachments.forEach((att: any, idx: number) => {
      console.log(`[${idx + 1}] Filename: ${att.filename} (${att.size} bytes)`);
    });
    console.log('=============================================\n');

    expect(email.subject).toBeTruthy();
  });

});
