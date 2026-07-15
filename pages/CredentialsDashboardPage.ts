import { Page, expect } from '@playwright/test';
import { ShareCredentialModal } from './ShareCredentialModal';
import { ShareInstitutionModal } from './ShareInstitutionModal';
import { AccountMenu } from './AccountMenu';

export class CredentialsDashboardPage {
  readonly shareModal: ShareCredentialModal;
  readonly instituteShareModal: ShareInstitutionModal;
  readonly accountMenu: AccountMenu;

  constructor(private readonly page: Page) {
    this.shareModal = new ShareCredentialModal(page);
    this.instituteShareModal = new ShareInstitutionModal(page);
    this.accountMenu = new AccountMenu(page);
  }

  private get shareButtonInTable() {
    return this.page.getByRole('table').getByRole('button', { name: 'Share' });
  }

  private get toastListItem() {
    return this.page.getByRole('listitem');
  }

  private get closeToastButton() {
    return this.page.getByRole('button', { name: 'Close toast' });
  }

  private get selfUploadsTab() {
    return this.page.getByRole('tab', { name: /Self Uploads/ });
  }

  private get resumesTab() {
    return this.page.getByRole('tab', { name: /Resumes/ });
  }

  /** Opens the Share modal for the first row in the credentials table. */
  async openShareDialogForFirstRow() {
    await this.shareButtonInTable.click();
  }

  /** Opens the Share modal for a specific type of credential (e.g. 'Self Uploads'). */
  async openShareDialogForCredentialType(credentialType: string) {
    const row = this.page.locator('table tbody tr', { hasText: credentialType }).first();
    await row.getByRole('button', { name: 'Share' }).click();
  }

  async selectSelfUploadsTab() {
    await this.selfUploadsTab.click();
  }

  async selectResumesTab() {
    await this.resumesTab.click();
  }

  async expectShareSuccessToast() {
    await expect(this.toastListItem).toContainText('Credential shared successfully');
  }

  async closeToast() {
    await this.closeToastButton.click();
  }
}
