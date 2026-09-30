import { test as base, expect } from '@playwright/test';

// No live API or external resources in the site compatibility checks.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await use(page);
  }
});
export { expect };
