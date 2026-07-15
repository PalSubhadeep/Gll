import { test, expect } from '@playwright/test';
import { RegistrationPage } from '../pages/RegistrationPage';

test.describe('Student Registration Options', () => {
  let registrationPage: RegistrationPage;

  test.beforeEach(async ({ page }) => {
    registrationPage = new RegistrationPage(page);
    await registrationPage.open();
    await registrationPage.clickRegister();
  });

  test('Option 1: Register with enrollment code', async () => {
    // Select the "I have an enrollment code" option
    await registrationPage.selectRegistrationOption('I have an enrollment code');

    // Fill the registration form
    await registrationPage.fillEnrollmentCodeForm(
      'Fuentes',
      'fChcKhsfNHz7HEWwoL21lRrvIHTIA9EDWhq5',
      '01/01/2005'
    );

    // Assert that the Validate button is visible
    await expect(registrationPage.validateButton).toBeVisible();
  });

  test('Option 2: Register without enrollment', async () => {
    // Select the "Register without enrollment" option
    await registrationPage.selectRegistrationOption('Register without enrollment');

    // Fill the registration form
    await registrationPage.fillWithoutEnrollmentForm(
      '12345678',
      '01/01/2005',
      'Fuentes'
    );

    // Assert that the Validate button is visible
    await expect(registrationPage.validateButton).toBeVisible();
  });

  test('Option 3: I am looking for enrollment', async () => {
    // Select the "I am looking for enrollment" option
    await registrationPage.selectRegistrationOption('I am looking for enrollment');

    // Fill the registration form with Dallas College as Institution
    await registrationPage.fillLookingForEnrollmentForm(
      'Dallas College',
      '12345678',
      '01/01/2005',
      'Fuentes'
    );

    // Assert that the Get Enrollment Code button is visible
    await expect(registrationPage.getEnrollmentCodeButton).toBeVisible();
  });
});
