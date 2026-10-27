import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import styles from './MarkdownText.module.css';

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const match = /language-(\S+)/.exec(className ?? '');
    if (match && typeof children === 'string') {
      return <CodeBlock code={children.replace(/\n$/, '')} lang={match[1]} />;
    }
    return <code className={className}>{children}</code>;
  },
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
