import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class RegistrationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Locators
  get registerLink(): Locator {
    return this.page.getByRole('link', { name: 'Register' });
  }

  get registrationOptionDropdown(): Locator {
    // The dropdown selector that changes the registration type
    return this.page.getByRole('combobox').first();
  }

  get enrollmentCodeInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Enrollment Code *' });
  }

  get studentNumberInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Student Number *' });
  }

  get lastNameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Last Name *' });
  }

  get dobInput(): Locator {
    // Some pages show 'Pick a date' and others show 'Select date'
    return this.page.getByRole('textbox', { name: /Pick a date|Select date/i });
  }

  get institutionDropdown(): Locator {
    return this.page.getByRole('combobox', { name: 'Institution *' });
  }

  get validateButton(): Locator {
    return this.page.getByRole('button', { name: 'Validate' });
  }

  get getEnrollmentCodeButton(): Locator {
    return this.page.getByRole('button', { name: 'Get Enrollment Code' });
  }

  // Helper Methods

  async open() {
    await this.goto('https://lockerdev.glcredentials.com/');
  }

  async clickRegister() {
    await this.registerLink.click();
  }

  async selectRegistrationOption(optionName: 'I have an enrollment code' | 'Register without enrollment' | 'I am looking for enrollment') {
    await this.registrationOptionDropdown.click();
    await this.page.getByRole('option', { name: optionName }).click();
  }

  /**
   * Option 1: I have an enrollment code
   */
  async fillEnrollmentCodeForm(lastName: string, enrollmentCode: string, dob: string) {
    await this.lastNameInput.fill(lastName);
    await this.enrollmentCodeInput.fill(enrollmentCode);
    await this.dobInput.fill(dob);
  }

  /**
   * Option 2: Register without enrollment
   */
  async fillWithoutEnrollmentForm(studentNumber: string, dob: string, lastName: string) {
    await this.studentNumberInput.fill(studentNumber);
    await this.dobInput.fill(dob);
    await this.lastNameInput.fill(lastName);
  }

  /**
   * Option 3: I am looking for enrollment
   */
  async fillLookingForEnrollmentForm(institution: string, studentNumber: string, dob: string, lastName: string) {
    // Select Institution by clicking, typing the query, and clicking the option
    await this.institutionDropdown.click();
    await this.institutionDropdown.fill(institution);
    await this.page.getByRole('option', { name: institution, exact: false }).first().click();

    // Fill the rest of the fields
    await this.studentNumberInput.fill(studentNumber);
    await this.dobInput.fill(dob);
    await this.lastNameInput.fill(lastName);
  }
}
