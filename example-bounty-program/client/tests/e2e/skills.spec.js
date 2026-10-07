import { test, expect } from './fixtures.js';

// The Skills page gives install commands people paste into a terminal: keep them to the released skills' own
// instructions (locked dependencies, no lifecycle scripts, the wallet wizard run by a human) and to working links.
test('the Skills page installs both skills from ClawHub with locked dependencies and a human-run wizard', async ({ page }) => {
  await page.goto('/skills');
  const main = page.locator('main');
  await expect(main.getByText('clawhub install verdikta-discover', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'ClawHub' }).first()).toHaveAttribute('href', 'https://clawhub.ai/nigelon11/skills/verdikta-discover');

  const github = main.locator('.install-content');
  await expect(github).toContainText('npm ci --ignore-scripts && node onboard.js');
  await expect(main).not.toContainText('npm install && node onboard.js');

  await main.getByRole('button', { name: 'ClawHub' }).click();
  const clawhub = main.locator('.install-content');
  await expect(clawhub).toContainText('clawhub install verdikta-bounties-onboarding\ncd skills/verdikta-bounties-onboarding/scripts\nnpm ci --ignore-scripts && node onboard.js');
  await expect(clawhub.getByRole('link', { name: 'ClawHub' })).toHaveAttribute('href', 'https://clawhub.ai/nigelon11/skills/verdikta-bounties-onboarding');
  await expect(main).not.toContainText('Set up Verdikta Bounties onboarding');
  await expect(main).toContainText('Never paste a password or a private key into an agent chat.');
});
