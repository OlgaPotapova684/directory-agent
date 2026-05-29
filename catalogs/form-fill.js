export async function tryFillEmail(page, email) {
  const selectors = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[placeholder*="mail" i]',
  ];

  for (const sel of selectors) {
    const field = page.locator(sel).first();
    if ((await field.count()) === 0) continue;
    try {
      await field.fill(email, { timeout: 5000 });
      const value = await field.inputValue();
      if (value.includes(email.split('@')[0])) return true;
    } catch {
      // следующий селектор
    }
  }
  return false;
}

export async function tryFillPassword(page, password) {
  const fields = page.locator('input[type="password"]');
  const count = await fields.count();
  if (count === 0) return false;

  try {
    for (let i = 0; i < count; i++) {
      await fields.nth(i).fill(password, { timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}
