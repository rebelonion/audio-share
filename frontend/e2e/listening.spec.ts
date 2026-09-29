import {expect, test, type Page} from '@playwright/test';

async function expandPlayer(page: Page) {
    const expand = page.getByRole('button', {name: 'Expand player', exact: true});
    if (await expand.isVisible()) await expand.click();
}

test('plays real audio, seeks, and restores a paused queue after reload', async ({page}) => {
    await page.goto('/share/rain');
    await page.getByRole('button', {name: 'Play this track', exact: true}).click();
    await expect(page.getByText('Currently playing', {exact: true})).toBeVisible();
    await expandPlayer(page);
    await page.getByRole('button', {name: 'Seek forward 30 seconds'}).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('audio-share:position') || '{}').time)).toBeGreaterThanOrEqual(30);
    await page.getByRole('button', {name: 'Add to queue', exact: true}).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('audio-share:queue:v1') || '{}').manual?.length)).toBe(1);
    await page.reload();
    await expect(page.getByText('Paused in player', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: /^Open queue/}).click();
    await expect(page.getByRole('button', {name: 'Remove Rain on the roof from queue'})).toBeVisible();
    await page.getByRole('button', {name: 'Close queue'}).click();
    await page.getByRole('button', {name: 'Play', exact: true}).click();
    await expect(page.getByText('Currently playing', {exact: true})).toBeVisible();
});

test('playback settings remain usable on desktop and mobile', async ({page}) => {
    await page.goto('/share/rain');
    await page.getByRole('button', {name: 'Add to queue', exact: true}).click();
    await expandPlayer(page);
    await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
    await page.getByRole('button', {name: 'Playback speed', exact: true}).click();
    await page.getByRole('option', {name: '1.5×', exact: true}).click();
    await page.getByRole('button', {name: 'Sleep timer', exact: true}).click();
    await page.getByRole('option', {name: '15 minutes', exact: true}).click();
    await page.getByLabel('Fade out over the last 10 seconds').check();
    await page.getByRole('button', {name: 'Repeat track', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Repeat track', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^Stops in 14:|^Stops in 15:/)).toBeVisible();
    await page.reload();
    await expandPlayer(page);
    await page.getByRole('button', {name: 'Playback settings', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Playback speed', exact: true})).toHaveText('1.5×');
    await expect(page.getByRole('button', {name: 'Sleep timer', exact: true})).toHaveText('Off');
});

test('recovers likes in a separate browser profile', async ({page, browser}) => {
    await page.goto('/share/rain');
    await page.getByRole('button', {name: 'Like track', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Unlike track', exact: true})).toBeVisible();
    await page.goto('/likes');
    await page.getByRole('button', {name: 'Create recovery key', exact: true}).click();
    const key = await page.getByText(/^asr_[A-Za-z0-9_-]+$/).innerText();
    const context = await browser.newContext();
    try {
        const recovered = await context.newPage();
        await recovered.goto(`http://127.0.0.1:4175/recover#key=${key}`);
        await expect(recovered.getByLabel('Recovery key', {exact: true})).toHaveValue(key);
        await expect(recovered).toHaveURL(/\/recover$/);
        await recovered.getByRole('button', {name: 'Recover likes', exact: true}).click();
        await expect(recovered).toHaveURL(/\/likes$/);
        await expect(recovered.getByText('Rain on the roof', {exact: true})).toBeVisible();
    } finally {
        await context.close();
    }
});
