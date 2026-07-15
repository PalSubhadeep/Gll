import { test } from '@playwright/test';

const students = [
  { name: 'Fuentes', code: 'fChcKhsfNHz7HEWwoL21lRrvIHTIA9EDWhq5' },
  { name: 'Andrews', code: 'sBKBxCynVWhx4cYj3NhDlvgOl70laLAW4MvJ' },
  { name: 'Meeran', code: 'XLYOTdoA8tjrQX7ahNLDMN1xixlPkXUnMgMH' },
  { name: 'DAVIS', code: 'TYOlmjOWrk8PXKhouybkLcw0P9j5706JAAR1' },
  { name: 'DAWSON', code: 'l7GzJK082X7viungOD7o0DOgOQeFUwNYeaxh' },
  { name: 'FLORES', code: 'ScJk9gPSIKRTAAzLUiyKxLnghq98O5nHJDxB' }
];

test('find correct DOBs', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('https://lockerdev.glcredentials.com/register');

  const combobox = page.getByRole('combobox').first();
  await combobox.click();
  await page.getByRole('option', { name: 'I have an enrollment code' }).click();
  await page.waitForTimeout(1000);

  const years = Array.from({ length: 13 }, (_, i) => 2000 + i);
  
  for (const student of students) {
    console.log(`\nTesting student: ${student.name}`);
    await page.getByRole('textbox', { name: 'Last Name *' }).fill(student.name);
    await page.getByRole('textbox', { name: 'Enrollment Code *' }).fill(student.code);

    let found = false;
    for (const year of years) {
      const dob = `${year}-01-01`;
      await page.getByRole('textbox', { name: 'Select date' }).fill(dob);
      await page.getByRole('button', { name: 'Validate' }).click();
      
      await page.waitForTimeout(1500);
      const matched = await page.getByLabel('Student Registration').locator('form').textContent();
      if (matched.includes('Matched Successfully')) {
        console.log(`>> SUCCESS! DOB for ${student.name} is ${dob}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`Could not find DOB for ${student.name} on Jan 1st`);
    }
  }
});
