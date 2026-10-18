import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownText.module.css';

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function MarkdownText({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
