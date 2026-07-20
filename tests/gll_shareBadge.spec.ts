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
  FERPA_TEST_DATA,
} from '../fixtures/testData';

const STUDENT_USERNAME = process.env.FERPA_HS_UNDER18_NO_DUAL_USERNAME!;
const STUDENT_PASSWORD = process.env.FERPA_HS_UNDER18_NO_DUAL_PASSWORD!;
const STUDENT_MENU_LABEL = process.env.FERPA_HS_UNDER18_NO_DUAL_MENU_LABEL!;

test.describe.serial('Digital Badges Sharing Tests', () => {

  test('share digital badge via email and verify delivery via IMAP', async ({ page }) => {
    // Increase test timeout to accommodate email delivery time
    test.setTimeout(150_000);

    const shareTriggerTime = new Date(Date.now() - 30_000);

    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(STUDENT_USERNAME, STUDENT_PASSWORD);
    await page.waitForURL(/.*\/student\/.*/);

    // 2. Select Digital Badges tab and open share modal for the first badge
    await dashboard.selectDigitalBadgesTab();
    await dashboard.openShareDialogForFirstBadge();

    // Verify modal options
    await expect(page.getByRole('radio', { name: 'Email' })).toBeVisible();

    // 3. Share via email
    await dashboard.shareModal.shareViaEmail(SHARE_RECIPIENT_EMAIL);
    await dashboard.expectShareSuccessToast();
    await dashboard.closeToast();

    console.log(`Digital badge shared to ${SHARE_RECIPIENT_EMAIL}. Waiting for email...`);

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
    console.log('       RECEIVED DIGITAL BADGE EMAIL DETAILS   ');
    console.log('=============================================');
    console.log(`From:    ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log('------------------ TEXT BODY ----------------');
    console.log(email.text || '(No text body)');
    console.log('=============================================\n');

    expect(email.subject).toBeTruthy();
  });

  test('share digital badge via institution', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // 1. Log in to the student account
    await loginPage.open();
    await loginPage.login(STUDENT_USERNAME, STUDENT_PASSWORD);
    await page.waitForURL(/.*\/student\/.*/);

    // 2. Select Digital Badges tab and open share modal
    await dashboard.selectDigitalBadgesTab();
    await dashboard.openShareDialogForFirstBadge();

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

  test('check digital badge in institute received list and acknowledge', async ({ page }) => {
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
    await receivedCredentials.expectTableContains(FERPA_TEST_DATA.hsUnder18NoDual.expectedStudentName);
    await receivedCredentials.expectTableContains(FERPA_TEST_DATA.hsUnder18NoDual.expectedSenderEmail);
  });

});
