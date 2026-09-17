// Used only by the isolated test bundle. Production imports the Sites runtime.
import { AsyncLocalStorage } from 'node:async_hooks';
export const identities = new AsyncLocalStorage();
export const env = {};
export async function getChatGPTUser() {
  const userId = identities.getStore();
  return userId ? { userId } : null;
}
