import 'dotenv/config';
import { test } from '@playwright/test';
import { SuperAdminUsersPage, AdminData } from '../pages/SuperAdminUsersPage';
import * as fs from 'fs';
import * as path from 'path';

test('Create Administrator via Super Admin Portal', async ({ page }) => {
  const inputPath = path.join(__dirname, '..', 'admin_input.json');
  const outputPath = path.join(__dirname, '..', 'admin_output.json');

  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    const errorResult = { success: false, error: 'Input file admin_input.json not found.' };
    fs.writeFileSync(outputPath, JSON.stringify(errorResult, null, 2));
    throw new Error('Input file admin_input.json not found.');
  }

  // Read inputs
  const rawInput = fs.readFileSync(inputPath, 'utf8');
  const adminData: AdminData = JSON.parse(rawInput);

  const superAdminUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'Superadmin@123';

  const adminUsersPage = new SuperAdminUsersPage(page);

  try {
    // 1. Login as Super Admin
    await adminUsersPage.login(superAdminUsername, superAdminPassword);

    // 2. Navigate to Users
    await adminUsersPage.clickUsers();

    // 3. Create Admin User
    const result = await adminUsersPage.addAdministrator(adminData);

    // 4. Write result
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(result.error);
    }
  } catch (err: any) {
    const failedResult = { success: false, error: err.message };
    fs.writeFileSync(outputPath, JSON.stringify(failedResult, null, 2));
    throw err;
  }
});
