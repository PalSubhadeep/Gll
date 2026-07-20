import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FerpaSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get userMenuOption() {
    return this.page.getByRole('button', { name: 'FERPA Settings' });
  }

  /**
   * Navigates to the FERPA Settings page via the account menu.
   * @param usernamePrefix The text/prefix on the user menu button to click (e.g. email or username).
   */
  async openFerpaSettings(usernamePrefix: string) {
    // Wait for the page to settle/load
    await this.page.waitForLoadState('domcontentloaded');
    
    const userButton = this.page.getByRole('button', { name: usernamePrefix });
    await userButton.waitFor({ state: 'visible' });
    // Open user menu dropdown
    await userButton.click();
    
    // Wait for dropdown menu to appear and click FERPA Settings
    await this.userMenuOption.waitFor({ state: 'visible' });
    await this.userMenuOption.click();

    // Wait for navigation to the FERPA settings page to complete
    await this.page.waitForURL(/.*tab=ferpa-settings.*/);
  }

  /**
   * Verifies that the parent/guardian signature flow is presented.
   */
  async verifyParentConsentRequired() {
    await expect(this.page.getByRole('main')).toContainText(
      'I declare that I am the parent/guardian of this student and that I have read, understood, and accepted the FERPA Release Authorization and Consent To Disclose Student Education Records items listed above.'
    );
    await expect(this.page.getByRole('main')).toContainText(
      'Because you are under 18 years of age, a parent or legal guardian must provide consent before your education records can be shared. Please have your parent or legal guardian select their name from the dropdown below and electronically sign the FERPA Consent Form..'
    );
  }

  /**
   * Verifies that the student-only signature flow is presented, and the parent signing flow is absent.
   */
  async verifyStudentConsentRequiredOnly() {
    await expect(this.page.getByRole('main')).toContainText(
      'I declare that I have read, understood, and accepted the FERPA Release Authorization and Consent To Disclose Student Education Records items listed above.'
    );

    // Verify parent/guardian consent texts are NOT displayed/offered
    await expect(this.page.getByRole('main')).not.toContainText(
      'I declare that I am the parent/guardian of this student'
    );
    await expect(this.page.getByRole('main')).not.toContainText(
      'Because you are under 18 years of age, a parent or legal guardian must provide consent'
    );
  }
}
