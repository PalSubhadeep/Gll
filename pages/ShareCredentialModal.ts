import { Page } from '@playwright/test';

/**
 * Component object for the "Share" modal that appears after clicking
 * Share on a credential row. Kept separate from CredentialsDashboardPage
 * since it's a distinct UI region with its own locators/actions.
 */
export class ShareCredentialModal {
  constructor(private readonly page: Page) {}

  private get emailRadio() {
    return this.page.getByRole('radio', { name: 'Email' });
  }

  private get emailAddressInput() {
    return this.page.getByRole('textbox', { name: 'Email Address', exact: true });
  }

  private get confirmEmailAddressInput() {
    return this.page.getByRole('textbox', { name: 'Confirm Email Address' });
  }

  private get shareButton() {
    return this.page.getByRole('button', { name: 'Share' });
  }

  async selectEmailMethod() {
    // Clicked twice in the original flow — appears needed to force the
    // email fields to render/reset. Kept as-is; revisit if the UI changes.
    await this.emailRadio.click();
    await this.emailRadio.click();
  }

  async fillRecipientEmail(email: string) {
    await this.emailAddressInput.click();
    await this.emailAddressInput.fill(email);
  }

  async fillConfirmEmail(email: string) {
    await this.confirmEmailAddressInput.click();
    await this.confirmEmailAddressInput.fill(email);
  }

  async submit() {
    await this.shareButton.click();
  }

  /** Convenience wrapper for the common case: same address in both fields. */
  async shareViaEmail(recipientEmail: string) {
    await this.selectEmailMethod();
    await this.fillRecipientEmail(recipientEmail);
    await this.fillConfirmEmail(recipientEmail);
    await this.submit();
  }
}
