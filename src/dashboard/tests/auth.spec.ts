import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs the docker-compose Casdoor (:8000) and the dashboard (:3000). Accounts are generated per run.
const run = randomUUID().slice(0, 8);
const user = {
    name: `e2e${run}`,
    email: `e2e${run}@example.test`,
    password: `Pw-${randomUUID()}`,
};

async function signUpAt(page: Page, name: string, email: string, password: string, confirm = password) {
    await page.getByRole('link', { name: 'sign up now' }).click();
    await page.getByRole('textbox', { name: 'Username*' }).fill(name);
    await page.getByRole('textbox', { name: 'Email*' }).fill(email);
    await page.getByRole('textbox', { name: 'Password*' }).fill(password);
    await page.getByRole('textbox', { name: 'Confirm*' }).fill(confirm);
    await page.getByRole('button', { name: 'Sign Up' }).click();
}

async function signIn(page: Page) {
    await page.getByRole('textbox', { name: 'Username' }).fill(user.name);
    await page.getByRole('textbox', { name: 'Password' }).fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/localhost:3000/);
}

async function signOut(page: Page) {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
}

test.describe.serial('identity gate', () => {
    test('anonymous protected route redirects to Casdoor', async ({ page }) => {
        await page.goto('/endpoints');
        await expect(page).toHaveURL(/:8000\/login\/oauth\/authorize/);
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('signup rejects mismatched passwords', async ({ page }) => {
        await page.goto('/endpoints');
        await signUpAt(page, `x${run}`, `x${run}@example.test`, user.password, 'different-password');
        await expect(page.getByText(/inconsistent with the password/i).first()).toBeVisible();
        await expect(page).toHaveURL(/:8000\/signup/);
    });

    test('signup lands on the requested page and exposes claims', async ({ page }) => {
        await page.goto('/endpoints');
        await signUpAt(page, user.name, user.email, user.password);
        await expect(page).toHaveURL(/localhost:3000\/endpoints/);

        await page.goto('/profile');
        const details = page.locator('dl');
        await expect(details).toContainText(user.name);
        // session.user.id is the OIDC sub, a UUID in Casdoor.
        await expect(details).toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    });

    test('signed-in owner reaches owner-scoped pages without errors', async ({ page }) => {
        await page.goto('/login');
        await signIn(page);
        for (const path of ['/datafeeds', '/endpoints']) {
            await page.goto(path);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await expect(page.getByText('A server error occurred')).toHaveCount(0);
        }
    });

    test('signout clears the Auth.js and Casdoor sessions', async ({ page }) => {
        await page.goto('/login');
        await signIn(page);
        await expect(page).toHaveURL(/localhost:3000\//);

        await signOut(page);
        await page.goto('/endpoints');
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('duplicate username and email are rejected', async ({ page }) => {
        await page.goto('/endpoints');
        await signUpAt(page, user.name, `other${run}@example.test`, user.password);
        await expect(page.getByText('Username already exists')).toBeVisible();

        await page.reload();
        await page.getByRole('textbox', { name: 'Username*' }).fill(`dup${run}`);
        await page.getByRole('textbox', { name: 'Email*' }).fill(user.email);
        await page.getByRole('textbox', { name: 'Password*' }).fill(user.password);
        await page.getByRole('textbox', { name: 'Confirm*' }).fill(user.password);
        await page.getByRole('button', { name: 'Sign Up' }).click();
        await expect(page.getByText('Email already exists')).toBeVisible();
    });

    test('an external callbackUrl is never followed after signin', async ({ page }) => {
        await page.goto('/login?callbackUrl=' + encodeURIComponent('https://evil.example/x'));
        await signIn(page);
        await page.waitForURL(/localhost:3000/);
        expect(new URL(page.url()).hostname).toBe('localhost');
    });

    test('a failed signin shows a generic message without echoing the error', async ({ page }) => {
        const res = await page.goto('/login?error=<b>injected</b>');
        expect(res?.status()).toBe(401);
        await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible();
        await expect(page.locator('body')).not.toContainText('injected');
    });

    test('a same-origin callbackUrl is honoured after signin', async ({ page }) => {
        await page.goto('/login?callbackUrl=' + encodeURIComponent('http://localhost:3000/profile'));
        await signIn(page);
        await expect(page).toHaveURL(/localhost:3000\/profile/);
    });
});
