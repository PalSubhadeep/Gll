import 'dotenv/config';
import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CredentialsDashboardPage } from '../pages/CredentialsDashboardPage';
import { ReceivedCredentialsPage } from '../pages/ReceivedCredentialsPage';
import {
  INSTITUTION_SHARE,
  INSTITUTION_RECIPIENT_ACCOUNT,
  EXPECTED_ACKNOWLEDGED_CREDENTIAL,
} from '../fixtures/testData';

test.describe.serial('gll_shareMail_check - share to institution', () => {
  test('send to dallas college', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);

    // ---------- Sender side: log in, share to institution, log out ----------
    await loginPage.open();
    await loginPage.login(
      INSTITUTION_SHARE.senderAccount.username,
      INSTITUTION_SHARE.senderAccount.password,
    );

    await dashboard.openShareDialogForFirstRow();
    await dashboard.instituteShareModal.shareToInstitution(
      INSTITUTION_SHARE.searchQuery,
      INSTITUTION_SHARE.institutionName,
    );
    await dashboard.closeToast();

    await dashboard.accountMenu.logoutAs(INSTITUTION_SHARE.accountMenuLabel);
  });

  test('check in institute the mail is correct or not', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const receivedCredentials = new ReceivedCredentialsPage(page);

    // ---------- Institution side: log in, acknowledge, verify content ----------
    await loginPage.open();
    await loginPage.loginViaXPathButton(
      INSTITUTION_RECIPIENT_ACCOUNT.username,
      INSTITUTION_RECIPIENT_ACCOUNT.password,
    );

    await receivedCredentials.open();
    await receivedCredentials.acknowledgeRow(0);
    await receivedCredentials.expectAcknowledgedToast();
    await receivedCredentials.closeToast();

    await receivedCredentials.expectTableContains(EXPECTED_ACKNOWLEDGED_CREDENTIAL.studentName);
    await receivedCredentials.expectTableContains(EXPECTED_ACKNOWLEDGED_CREDENTIAL.senderEmail);
  });
});