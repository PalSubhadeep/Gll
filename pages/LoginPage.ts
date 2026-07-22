import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get loginNavLink() {
    return this.page.getByRole('navigation').getByRole('link', { name: 'Login' });
  }

  private get usernameInput() {
    return this.page.getByRole('textbox', { name: 'Username *' });
  }

  private get passwordInput() {
    return this.page.getByRole('textbox', { name: 'Password *' });
  }

  private get loginButton() {
    return this.page.getByRole('button', { name: 'Login' });
  }

  async open() {
    await this.goto(process.env.BASE_URL || 'https://lockeruat.glcredentials.com/');
  }

  async openLoginForm() {
    await this.loginNavLink.click();
  }

  async login(username: string, password: string) {
    await this.openLoginForm();
    await this.usernameInput.click();
    await this.usernameInput.fill(username);
    await this.passwordInput.click();
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * Alternate login path recorded against the institution-side account.
   * Uses an xpath locator for the Login button and a fixed post-login
   * wait — this account's page appears slower to settle after auth than
   * the standard flow above. Revisit if a getByRole locator proves stable
   * here too; keeping the xpath fallback for now since that's what was
   * verified working.
   */
  async loginViaXPathButton(username: string, password: string, postLoginWaitMs = 6000) {
    await this.openLoginForm();
    await this.usernameInput.click();
    await this.usernameInput.fill(username);
    await this.passwordInput.click();
    await this.passwordInput.fill(password);
    await this.page.locator("//button[text()='Login']").click();
    if (postLoginWaitMs) {
      await this.page.waitForTimeout(postLoginWaitMs);
    }
  }

  /**
   * True if the "Login" nav link is visible, meaning the session has
   * expired/logged out. Used to detect and recover from session timeout
   * during long polling waits (e.g. waiting for a scheduled share).
   */
  async isLoginPromptVisible(): Promise<boolean> {
    return this.loginNavLink.isVisible().catch(() => false);
  }
}
