import { test, expect } from '@playwright/test';

test('exibe login e protege o painel', async function({ page }) {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('abre cadastro e recuperacao de senha', async function({ page }) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Cadastro' })).toBeVisible();
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible();
});

test('API e banco respondem como online', async function({ request }) {
  const resposta = await request.get('http://127.0.0.1:3001/api/health');
  expect(resposta.ok()).toBeTruthy();
  const dados = await resposta.json();
  expect(dados.status).toBe('online');
  expect(dados.banco).toBe('online');
});
