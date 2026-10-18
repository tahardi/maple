import styles from './Banner.module.css';

type BannerProps = { messages: readonly string[] };

export function Banner({ messages }: BannerProps) {
  return (
    <div role="alert" className={styles.banner}>
      <ul>
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
