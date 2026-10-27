import type { Epic } from '@shared/types/jira';
import styles from './EpicLozenge.module.css';

const SHADES = ['purple', 'blue', 'green', 'teal', 'yellow', 'orange', 'red', 'magenta', 'lime'];

type Props = { epic: Epic };

export function EpicLozenge({ epic }: Props) {
  const name = epic.color?.replace(/^dark_/, '') ?? '';
  const shade = SHADES.includes(name) ? name : 'grey';

  return (
    <span className={styles.lozenge} data-color={shade} title={epic.key}>
      {epic.summary}
    </span>
  );
}
