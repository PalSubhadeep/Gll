import 'dotenv/config';
import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { FerpaSettingsPage } from '../pages/FerpaSettingsPage';
import { FERPA_TEST_DATA } from '../fixtures/testData';

test.describe('FERPA Agreement Signing Flow Tests', () => {
  test('High School Student (Under 18, No Dual Transcript) requires parent/guardian signature', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const ferpaPage = new FerpaSettingsPage(page);

    await loginPage.open();
    await loginPage.login(
      FERPA_TEST_DATA.hsUnder18NoDual.username,
      FERPA_TEST_DATA.hsUnder18NoDual.password
    );
    await page.waitForURL(/.*\/student\/.*/);

    await ferpaPage.openFerpaSettings(FERPA_TEST_DATA.hsUnder18NoDual.menuLabel);
    await ferpaPage.verifyParentConsentRequired();
  });

  test('High School Student (Under 18, Has Dual Transcript) requires student-only signature', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const ferpaPage = new FerpaSettingsPage(page);

    await loginPage.open();
    await loginPage.login(
      FERPA_TEST_DATA.hsUnder18WithDual.username,
      FERPA_TEST_DATA.hsUnder18WithDual.password
    );
    await page.waitForURL(/.*\/student\/.*/);

    await ferpaPage.openFerpaSettings(FERPA_TEST_DATA.hsUnder18WithDual.menuLabel);
    await ferpaPage.verifyStudentConsentRequiredOnly();
  });

  test('Any Institution Other Than High School 1 requires student-only signature', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const ferpaPage = new FerpaSettingsPage(page);

    await loginPage.open();
    await loginPage.login(
      FERPA_TEST_DATA.otherCollege.username,
      FERPA_TEST_DATA.otherCollege.password
    );
    await page.waitForURL(/.*\/student\/.*/);

    await ferpaPage.openFerpaSettings(FERPA_TEST_DATA.otherCollege.menuLabel);
    await ferpaPage.verifyStudentConsentRequiredOnly();
  });
});
