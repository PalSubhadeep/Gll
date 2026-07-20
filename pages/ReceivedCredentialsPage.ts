import { Page, Locator, expect } from '@playwright/test';

/**
 * The institution-side "Credentials" table where incoming shared
 * credentials show up to be acknowledged.
 */
export class ReceivedCredentialsPage {
  constructor(private readonly page: Page) {}

  private get credentialsNavLink() {
    return this.page.getByRole('link', { name: 'Credentials' });
  }

  private get closeToastButton() {
    return this.page.getByRole('button', { name: 'Close toast' });
  }

  async open() {
    await this.credentialsNavLink.click();
  }

  /**
   * Locates the acknowledge/action button for a given row.
   * NOTE: hardcoded to column 12 (index 11), 3rd button (index 2) —
   * matches the current table layout. Update here if columns change,
   * rather than in the spec.
   */
  private rowActionButton(rowIndex = 0): Locator {
    return this.page
      .locator('table tbody tr')
      .nth(rowIndex)
      .locator('td')
      .last()
      .locator('button')
      .nth(2);
  }

  async acknowledgeRow(rowIndex = 0) {
    const actionButton = this.rowActionButton(rowIndex);
    await expect(actionButton).toBeVisible();
    await expect(actionButton).toBeEnabled();
    await actionButton.click();
  }

  async expectAcknowledgedToast() {
    await expect(this.page.getByText('Successfully acknowledged')).toBeVisible();
  }

  async closeToast() {
    await this.closeToastButton.click();
  }

  private get tableBody() {
    return this.page.locator('tbody');
  }

  async expectTableContains(text: string) {
    await expect(this.tableBody).toContainText(text);
  }

  async expectTableNotContains(text: string) {
    await expect(this.tableBody).not.toContainText(text);
  }

  private get loginNavLink() {
    return this.page.getByRole('navigation').getByRole('link', { name: 'Login' });
  }

  /**
   * Polls until the given text shows up in the table, reloading on each
   * attempt. If the session has expired during a long wait (login link
   * reappears), calls `onSessionExpired` to log back in before re-checking.
   * Used for scheduled-share tests where the credential only appears after
   * a delay and the session may not survive that long.
   */
  async waitUntilTableContains(
    text: string,
    options: { timeoutMs: number; intervalMs?: number; onSessionExpired: () => Promise<void> },
  ) {
    await expect(async () => {
      await this.page.reload();

      const loggedOut = await this.loginNavLink.isVisible().catch(() => false);
      if (loggedOut) {
        await options.onSessionExpired();
      } else {
        await this.open();
      }

      await expect(this.tableBody).toContainText(text);
    }).toPass({
      timeout: options.timeoutMs,
      intervals: [options.intervalMs ?? 15_000],
    });
  }
}
