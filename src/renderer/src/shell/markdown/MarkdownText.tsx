import { allowedLinkHost } from '@shared/learning/lessonLinks';
import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import styles from './MarkdownText.module.css';

function Link({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const COMPONENTS: Components = {
  a: Link,
  code: ({ className, children }) => {
    const match = /language-(\S+)/.exec(className ?? '');
    if (match && typeof children === 'string') {
      return <CodeBlock code={children.replace(/\n$/, '')} lang={match[1]} />;
    }
    return <code className={className}>{children}</code>;
  },
};

function limitLinks(linkHosts: readonly string[] | undefined): Components {
  if (linkHosts === undefined) {
    return COMPONENTS;
  }

  return {
    ...COMPONENTS,
    a: ({ href = '', children }) => {
      if (allowedLinkHost(href, linkHosts)) {
        return <Link href={href}>{children}</Link>;
      }

      return (
        <>
          {children}
          {` (${href})`}
        </>
      );
    },
  };
}

export function MarkdownText({ text, linkHosts }: { text: string; linkHosts?: readonly string[] }) {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={[remarkGfm]} components={limitLinks(linkHosts)}>
        {text}
      </Markdown>
    </div>
  );
}
