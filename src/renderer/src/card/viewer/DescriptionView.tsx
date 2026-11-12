import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import styles from './FileViewer.module.css';

export function DescriptionView({ text }: { text: string }) {
  return (
    <div className={styles.description}>
      <MarkdownText text={text} />
    </div>
  );
}
