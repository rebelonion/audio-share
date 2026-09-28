import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    reporter: [['list'], ['html', {open: 'never'}]],
    use: {
        baseURL: 'http://127.0.0.1:4175',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
        {name: 'mobile-chromium', use: {...devices['Pixel 7']}},
    ],
    webServer: {
        command: 'node e2e/server.mjs',
        url: 'http://127.0.0.1:4175/api/health',
        reuseExistingServer: false,
    },
});
