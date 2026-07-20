import { Page } from '@playwright/test';

/**
 * Component object for the "Share" modal when sharing to an institution
 * (as opposed to sharing via email). Search box + result selection + submit.
 */
export class ShareInstitutionModal {
  constructor(private readonly page: Page) {}

  private get institutionSearchInput() {
    return this.page.getByRole('textbox', { name: 'Type to search institution' });
  }

  private get shareButton() {
    return this.page.locator('[data-slot="dialog-content"] button[type="submit"]');
  }

  async searchInstitution(query: string) {
    await this.institutionSearchInput.click();
    await this.institutionSearchInput.fill(query);
  }

  async selectInstitutionResult(institutionName: string) {
    await this.page.locator('.max-h-60').getByText(institutionName, { exact: true }).click();
  }

  async submit() {
    await this.shareButton.click();
  }

  /** Convenience wrapper: search, pick the exact match, submit. */
  async shareToInstitution(searchQuery: string, institutionName: string) {
    await this.searchInstitution(searchQuery);
    await this.selectInstitutionResult(institutionName);
    await this.page.waitForTimeout(1000);
    await this.submit();
  }
}
