import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CredentialsDashboardPage } from '../pages/CredentialsDashboardPage';
import { ScheduleShareModal } from '../pages/ScheduleShareModal';
import { ReceivedCredentialsPage } from '../pages/ReceivedCredentialsPage';
import { resolveScheduledTime } from '../utils/scheduleTime';
import {
  SCHEDULED_SHARE,
  INSTITUTION_RECIPIENT_ACCOUNT,
  EXPECTED_SCHEDULED_CREDENTIAL,
} from '../fixtures/testData';

// Shared between the two serial tests, same pattern as the original script.
let shareExecutionTime: Date;
let scheduledTime: Date;
let offsetMinutesUsed: number;

test.describe.serial('gll_scheduledShare', () => {
  test('send the scheduled share to dallas', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboard = new CredentialsDashboardPage(page);
    const scheduleModal = new ScheduleShareModal(page);

    await loginPage.open();
    await loginPage.login(SCHEDULED_SHARE.senderAccount.username, SCHEDULED_SHARE.senderAccount.password);

    await dashboard.openShareDialogForFirstRow();
    await dashboard.instituteShareModal.searchInstitution(SCHEDULED_SHARE.searchQuery);
    await dashboard.instituteShareModal.selectInstitutionResult(SCHEDULED_SHARE.institutionName);

    // Resolve the target time right before picking it in the UI -- either
    // SCHEDULE_AT (absolute) or SCHEDULE_OFFSET_MINUTES (relative) from
    // .env, instead of a hardcoded constant. scheduleFor() then snaps it
    // to the nearest 10-minute step (the picker's only granularity) and
    // returns the snapped value, which is what we actually wait for below
    // -- not the raw, unsnapped target.
    const resolved = resolveScheduledTime();
    offsetMinutesUsed = resolved.offsetMinutes;

    shareExecutionTime = new Date();
    scheduledTime = await scheduleModal.scheduleFor(resolved.scheduledTime);
    await dashboard.instituteShareModal.submit();

    console.log('\n=============================================');
    console.log('         SCHEDULED SHARE TIMING DETAILS      ');
    console.log('=============================================');
    console.log('Shared Time (Executed At) : ', shareExecutionTime.toLocaleString());
    console.log('Expected Delivery Time    : ', scheduledTime.toLocaleString());
    console.log(`Offset Configured         : ${offsetMinutesUsed} minutes`);
    console.log('=============================================\n');

    await expect(page.getByRole('listitem')).toContainText('Credential sharing scheduled successfully');
    await dashboard.closeToast();

    await dashboard.accountMenu.logoutAs(SCHEDULED_SHARE.accountMenuLabel);
  });

  test('check in dallas the mail is correct or not', async ({ page }) => {
    // Generous ceiling covering the wait + a polling buffer after the
    // scheduled time. Computed from the actual offset used above instead
    // of a hardcoded number, so it scales automatically if the offset changes.
    test.setTimeout(offsetMinutesUsed * 60_000 + 10 * 60_000);

    const loginPage = new LoginPage(page);
    const receivedCredentials = new ReceivedCredentialsPage(page);

    await loginPage.open();
    await loginPage.loginViaXPathButton(
      INSTITUTION_RECIPIENT_ACCOUNT.username,
      INSTITUTION_RECIPIENT_ACCOUNT.password,
    );
    await receivedCredentials.open();

    console.log('\n=============================================');
    console.log('         CHECKING SCHEDULED DELIVERY         ');
    console.log('=============================================');
    console.log('Shared Time (Executed At) : ', shareExecutionTime ? shareExecutionTime.toLocaleString() : 'N/A');
    console.log('Expected Delivery Time    : ', scheduledTime ? scheduledTime.toLocaleString() : 'N/A');
    console.log('Current Check Time        : ', new Date().toLocaleString());
    console.log('=============================================\n');

    await receivedCredentials.expectTableNotContains(EXPECTED_SCHEDULED_CREDENTIAL.senderEmail);
    console.log('Credential not received before scheduled time - correct');

    const remainingMs = scheduledTime.getTime() - Date.now();
    if (remainingMs > 0) {
      console.log(`Waiting ${Math.round(remainingMs / 1000)}s until scheduled time (${scheduledTime.toLocaleString()})`);
      await page.waitForTimeout(remainingMs);
    }
    console.log('Checking after schedule:', new Date().toLocaleString());

    // Polls the table, reloading and re-logging in if the session expired
    // during the wait -- logic lives in the page object, not the spec.
    await receivedCredentials.waitUntilTableContains(EXPECTED_SCHEDULED_CREDENTIAL.senderEmail, {
      timeoutMs: 5 * 60_000,
      intervalMs: 15_000,
      onSessionExpired: () =>
        loginPage.loginViaXPathButton(
          INSTITUTION_RECIPIENT_ACCOUNT.username,
          INSTITUTION_RECIPIENT_ACCOUNT.password,
        ),
    });
    console.log('Credential received after scheduled time');

    await receivedCredentials.acknowledgeRow(0);
    await receivedCredentials.expectAcknowledgedToast();
    await receivedCredentials.closeToast();

    await receivedCredentials.expectTableContains(EXPECTED_SCHEDULED_CREDENTIAL.studentName);
    await receivedCredentials.expectTableContains(EXPECTED_SCHEDULED_CREDENTIAL.senderEmail);
  });
});