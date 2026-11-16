import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { CARD_DESCRIPTION } from './cardDescription';
import { COMMENTS_TAB } from './commentsTab';
import { FINDINGS } from './findingsTab';
import { PR_DESCRIPTION } from './prDescription';

export function baseName(path: string): string {
  if (path === PR_DESCRIPTION) {
    return 'PR description';
  }
  if (path === CARD_DESCRIPTION) {
    return 'Card description';
  }
  if (path === FINDINGS) {
    return 'Findings';
  }
  if (path === COMMENTS_TAB) {
    return 'Comments';
  }
  const bare = path.startsWith(VAULT_PREFIX) ? path.slice(VAULT_PREFIX.length) : path;
  return bare.split('/').at(-1) ?? bare;
}
