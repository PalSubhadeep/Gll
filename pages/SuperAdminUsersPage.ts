import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface AdminData {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  university: string;
  roles: string[];
  campus?: string; // Optional campus selection
}

export class SuperAdminUsersPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Locators
  get loginLink(): Locator {
    return this.page.getByRole('navigation').getByRole('link', { name: 'Login' });
  }

  get usernameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Username *' });
  }

  get passwordInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Password *' });
  }

  get loginButton(): Locator {
    return this.page.getByRole('button', { name: 'Login' });
  }

  get usersNavLink(): Locator {
    return this.page.getByRole('link', { name: 'Users' });
  }

  get addAdminButton(): Locator {
    return this.page.getByRole('button', { name: 'Add Administrator' });
  }

  get rolesDropdown(): Locator {
    return this.page.getByRole('combobox').filter({ hasText: /Select roles/i });
  }

  get universityDropdown(): Locator {
    return this.page.getByRole('combobox', { name: 'University *' });
  }

  get universitySearchInput(): Locator {
    return this.page.getByRole('textbox', { name: /Search/i });
  }

  get campusDropdown(): Locator {
    return this.page.getByRole('combobox').filter({ hasText: /Select campuses/i });
  }

  get addBtn(): Locator {
    return this.page.getByRole('button', { name: 'Add', exact: true });
  }

  get adminUsernameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Username', exact: true });
  }

  get adminFirstNameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'First Name *' });
  }

  get adminLastNameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Last Name *' });
  }

  get adminEmailInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Email Address *' });
  }

  // Helper Methods

  async open() {
    await this.goto('https://lockerdev.glcredentials.com/');
  }

  async login(username: string, password: string) {
    await this.open();
    await this.loginLink.click();
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForURL(/.*dashboard|.*received-credentials|.*users/i).catch(() => { });
  }

  async clickUsers() {
    await this.usersNavLink.click();
    await expect(this.page.getByRole('heading', { name: 'Users' })).toBeVisible();
  }

  async addAdministrator(data: AdminData): Promise<{ success: boolean; error?: string }> {
    // Role matching mapping
    const roleMap: Record<string, string> = {
      'issuing admin': 'Issuing admin',
      'super admin': 'Super Admin',
      'counselor': 'Counselor',
      'receiver': 'Receiver',
      'recommender': 'Recommender'
    };

    // 1. Click Add Administrator
    await this.addAdminButton.click();

    // Wait for the modal dialog to be visible and stable
    await this.page.getByRole('heading', { name: 'Add Admin' }).waitFor({ state: 'visible' });

    // 2. Fill personal info first
    await this.adminUsernameInput.fill(data.username);
    await this.adminFirstNameInput.fill(data.firstName);
    await this.adminLastNameInput.fill(data.lastName);
    await this.adminEmailInput.fill(data.email);

    // 3. Select Roles
    if (data.roles && data.roles.length > 0) {
      await this.rolesDropdown.click();
      for (const role of data.roles) {
        const normalized = role.toLowerCase().trim();
        const mappedRoleName = roleMap[normalized] || role;

        // Find checkbox label text inside the active dialog overlay specifically
        const optionLocator = this.page.getByRole('dialog').getByText(mappedRoleName, { exact: true }).or(
          this.page.getByRole('option', { name: mappedRoleName })
        ).or(
          this.page.getByText(mappedRoleName, { exact: true })
        );
        await optionLocator.first().click();
      }
      // Press Escape to close the expanded roles popover
      await this.page.keyboard.press('Escape');
    }

    // Determine user roles from input to enforce specific selection requirements
    const isGlobalAdmin = data.roles.some(role => {
      const r = role.toLowerCase().trim();
      return r.includes('super admin') || r.includes('support admin') || r === 'super' || r === 'support';
    });

    const isCounselor = data.roles.some(role => {
      const r = role.toLowerCase().trim();
      return r.includes('counselor') || r.includes('counselling');
    });

    if (!isGlobalAdmin) {
      // 4. Select University
      await expect(this.page.getByText('University *')).toBeVisible();
      await this.universityDropdown.click();

      const cleanUniversity = data.university.replace(/^["']|["']$/g, '').trim();

      // Check if the search input box is visible before typing in it
      const searchInput = this.page.getByRole('dialog').getByRole('textbox').first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill(cleanUniversity);
        // Wait for input debounce and loading state to trigger
        await this.page.waitForTimeout(1000);
        // Wait for any dynamic loading state to settle
        await expect(this.page.getByRole('dialog').getByText('Loading...')).toBeHidden({ timeout: 8000 }).catch(() => { });
        await this.page.getByRole('dialog').locator('button').first().waitFor({ state: 'visible', timeout: 4000 }).catch(() => { });
      }
      const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const exactRegexPattern = '^\\s*' + escapeRegex(cleanUniversity).replace(/\s+/g, '\\s+') + '\\s*$';
      const exactRegex = new RegExp(exactRegexPattern, 'i');

      // Locate all buttons in the active dialog
      const buttons = this.page.getByRole('dialog').locator('button');

      // Find the one that has a span with the exact text
      let targetButton = buttons.filter({
        has: this.page.locator('span.truncate, span').filter({ hasText: exactRegex })
      }).first();

      // Fallback to searching button text directly with the exact regex
      if (await targetButton.count() === 0) {
        targetButton = buttons.filter({ hasText: exactRegex }).first();
      }

      if (await targetButton.count() === 0) {
        const availableOptions: string[] = [];
        const count = await buttons.count();
        for (let i = 0; i < count; i++) {
          const txt = await buttons.nth(i).textContent().catch(() => '');
          if (txt) {
            const cleaned = txt.trim().replace(/\s+/g, ' ');
            if (cleaned) availableOptions.push(cleaned);
          }
        }
        return {
          success: false,
          error: `Could not find exact university matching "${cleanUniversity}". Found options: [${availableOptions.join(', ')}]`
        };
      }

      await targetButton.click();

      // 5. Select Campus (only Counselor role requires campus selection, and if campuses exist)
      if (isCounselor && data.campus) {
        await this.page.waitForTimeout(1000);
        const isCampusVisible = await this.campusDropdown.isVisible().catch(() => false);
        const cleanCampus = data.campus.replace(/^["']|["']$/g, '').trim();

        if (isCampusVisible && cleanCampus) {
          await this.campusDropdown.click();

          const campusesToSelect = cleanCampus.split(',').map(c => c.trim()).filter(Boolean);
          for (const campus of campusesToSelect) {
            const campusSearchInput = this.page.getByRole('dialog').getByRole('textbox').first();

            if (campus.toLowerCase() === 'all' || campus.toLowerCase() === 'select all') {
              await this.page.getByText('Select All', { exact: true }).first().click();
            } else {
              if (await campusSearchInput.isVisible().catch(() => false)) {
                await campusSearchInput.fill('');
                await campusSearchInput.fill(campus);
                // Wait for input debounce and loading state to trigger
                await this.page.waitForTimeout(1000);
                // Wait for loading indicator to settle
                await expect(this.page.getByRole('dialog').getByText('Loading...')).toBeHidden({ timeout: 5000 }).catch(() => { });
              }

              const campusRegexPattern = '^\\s*' + escapeRegex(campus).replace(/\s+/g, '\\s+') + '\\s*$';
              const campusRegex = new RegExp(campusRegexPattern, 'i');

              const campusOption = this.page.getByRole('dialog').locator('label').filter({
                hasText: campusRegex
              }).or(
                this.page.getByText(campus, { exact: true })
              );

              if (await campusOption.count() === 0) {
                const availableCampuses: string[] = [];
                const labels = this.page.getByRole('dialog').locator('label');
                const lCount = await labels.count();
                for (let j = 0; j < lCount; j++) {
                  const txt = await labels.nth(j).textContent().catch(() => '');
                  if (txt) {
                    const cleaned = txt.trim().replace(/\s+/g, ' ');
                    if (cleaned) availableCampuses.push(cleaned);
                  }
                }
                return {
                  success: false,
                  error: `Could not find exact campus matching "${campus}". Found options: [${availableCampuses.join(', ')}]`
                };
              }
              await campusOption.first().click();
            }
          }
          await this.page.keyboard.press('Escape');
        }
      }
    }

    // 6. Submit the form
    await this.addBtn.click();
    // 7. Assert success or handle failures
    try {
      await this.page.getByText('Administrator created').waitFor({ state: 'visible', timeout: 7000 });
      return { success: true };
    } catch (err: any) {
      // Capture error toast or validation messages on form
      const toastText = await this.page.locator('[role="alert"], .toast, .alert, [class*="error"]').first().textContent().catch(() => null);
      if (toastText) {
        return { success: false, error: toastText.trim() };
      }

      // Check form text for specific validation issues
      const bodyText = await this.page.textContent('body');
      if (bodyText) {
        if (bodyText.includes('already exists') || bodyText.includes('already taken')) {
          const match = bodyText.match(/.*already (exists|taken).*/i);
          if (match) {
            return { success: false, error: match[0].trim() };
          }
        }
      }
      return { success: false, error: `Verification failed: ${err.message}` };
    }
  }
}
