import type { LessonExample } from '@shared/types/learning/lessonExample';
import styles from './LessonPage.module.css';

export function ExampleView({ example }: { example: LessonExample }) {
  const { normal, attack, mark } = example;
  const at = attack.indexOf(mark);
  return (
    <pre className={styles.example}>
      <span>{normal}</span>
      {'\n'}
      <span>
        {attack.slice(0, at)}
        <mark>{mark}</mark>
        {attack.slice(at + mark.length)}
      </span>
    </pre>
  );
}
