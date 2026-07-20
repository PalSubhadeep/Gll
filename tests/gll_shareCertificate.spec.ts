import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CredentialsDashboardPage } from '../pages/CredentialsDashboardPage';
import { ReceivedCredentialsPage } from '../pages/ReceivedCredentialsPage';
import { waitForShareEmail } from '../utils/emailVerifier';
import {
  SHARE_RECIPIENT_EMAIL,
  INSTITUTION_SHARE,
  INSTITUTION_RECIPIENT_ACCOUNT,
  EXPECTED_ACKNOWLEDGED_CREDENTIAL,
  CERTIFICATE_SHARE,
} from '../fixtures/testData';

const STUDENT_USERNAME = CERTIFICATE_SHARE.senderAccount.username;
const STUDENT_PASSWORD = CERTIFICATE_SHARE.senderAccount.password;
const STUDENT_MENU_LABEL = CERTIFICATE_SHARE.accountMenuLabel;

test.describe.serial('Certificates Sharing Tests', () => {

  test('share certificate via email and verify delivery via IMAP', async ({ page }) => {
    // Increase test timeout to accommodate email delivery time
    test.setTimeout(150_000);

    const shareTriggerTime = new Date(Date.now() - 30_000);

    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(STUDENT_USERNAME, STUDENT_PASSWORD);
    await page.waitForURL(/.*\/student\/.*/);

    // 2. Select Certificates tab and open share modal for the first certificate
    await dashboard.selectCertificatesTab();
    await dashboard.openShareDialogForFirstCertificate();

    // Verify modal options
    await expect(page.getByRole('radio', { name: 'Email' })).toBeVisible();

    // 3. Share via email
    await dashboard.shareModal.shareViaEmail(SHARE_RECIPIENT_EMAIL);
    await dashboard.expectShareSuccessToast();
    await dashboard.closeToast();

    console.log(`Certificate shared to ${SHARE_RECIPIENT_EMAIL}. Waiting for email...`);

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
    console.log('       RECEIVED CERTIFICATE EMAIL DETAILS     ');
    console.log('=============================================');
    console.log(`From:    ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log('------------------ TEXT BODY ----------------');
    console.log(email.text || '(No text body)');
    console.log('=============================================\n');

    expect(email.subject).toBeTruthy();
  });

  test('share certificate via institution', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(STUDENT_USERNAME, STUDENT_PASSWORD);
    await page.waitForURL(/.*\/student\/.*/);

    // 2. Select Certificates tab and open share modal
    await dashboard.selectCertificatesTab();
    await dashboard.openShareDialogForFirstCertificate();

    // 3. Share to institution
    await dashboard.instituteShareModal.shareToInstitution(
      INSTITUTION_SHARE.searchQuery,
      INSTITUTION_SHARE.institutionName
    );
    await dashboard.expectShareSuccessToast();
    await dashboard.closeToast();

    // 4. Log out so we can log in as the institution user
    await dashboard.accountMenu.logoutAs(STUDENT_MENU_LABEL);
  });

  test('check certificate in institute received list and acknowledge', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const receivedCredentials = new ReceivedCredentialsPage(page);

    // 1. Log in as the institution recipient
    await loginPage.open();
    await loginPage.loginViaXPathButton(
      INSTITUTION_RECIPIENT_ACCOUNT.username,
      INSTITUTION_RECIPIENT_ACCOUNT.password
    );

    // 2. Open received list, acknowledge the row, and verify toast
    await receivedCredentials.open();
    await receivedCredentials.acknowledgeRow(0);
    await receivedCredentials.expectAcknowledgedToast();
    await receivedCredentials.closeToast();

    // 3. Verify content
    await receivedCredentials.expectTableContains(CERTIFICATE_SHARE.expectedStudentName);
    await receivedCredentials.expectTableContains(CERTIFICATE_SHARE.expectedSenderEmail);
  });

});
