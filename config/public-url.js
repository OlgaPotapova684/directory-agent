/**
 * Публичный URL приложения (локально или после деплоя).
 * На Render/Railway задайте PUBLIC_URL=https://ваш-сервис.onrender.com
 */
export function getPublicBaseUrl() {
  const fromEnv = process.env.PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

export function getTrainingRegisterUrl() {
  return `${getPublicBaseUrl()}/training-catalog/register`;
}
