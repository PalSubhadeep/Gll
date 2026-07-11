import { Page } from '@playwright/test';

/**
 * Shared base class for all page objects.
 * Keep genuinely shared behavior here (navigation helpers, common waits) —
 * avoid dumping page-specific locators/actions into this class.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
  }
}
