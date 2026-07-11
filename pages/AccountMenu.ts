import { Page } from '@playwright/test';

/**
 * The account menu button in the top nav (shows a truncated username)
 * and its Logout action.
 */
export class AccountMenu {
  constructor(private readonly page: Page) {}

  async open(usernamePrefix: string) {
    await this.page.getByRole('button', { name: usernamePrefix }).click();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Logout' }).click();
  }

  /** Convenience wrapper: open the menu for this user, then log out. */
  async logoutAs(usernamePrefix: string) {
    await this.open(usernamePrefix);
    await this.logout();
  }
}
