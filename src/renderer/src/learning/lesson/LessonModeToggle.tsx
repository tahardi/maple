import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

type LessonModeToggleProps = { onePage: boolean; onChange: (onePage: boolean) => void };

export function LessonModeToggle({ onePage, onChange }: LessonModeToggleProps) {
  return (
    <div role="group" aria-label="Lesson layout" className={styles.toggle}>
      <Button
        label="Steps"
        pressed={!onePage}
        onClick={() => {
          onChange(false);
        }}
      />
      <Button
        label="One page"
        pressed={onePage}
        onClick={() => {
          onChange(true);
        }}
      />
    </div>
  );
}
