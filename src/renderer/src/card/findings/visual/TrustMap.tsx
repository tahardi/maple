import { Fragment } from 'react';
import styles from './TrustMap.module.css';

type TrustMapProps = { zones: readonly string[]; from: string; to: string };

export function TrustMap({ zones, from, to }: TrustMapProps) {
  const low = Math.min(zones.indexOf(from), zones.indexOf(to));
  const high = Math.max(zones.indexOf(from), zones.indexOf(to));
  return (
    <ol className={styles.map}>
      {zones.map((zone, index) => {
        const crossedLine = index > low && index <= high;
        return (
          <Fragment key={zone}>
            {index > 0 &&
              (crossedLine ? (
                <li className={styles.line} data-crossed="true">
                  crossed here
                </li>
              ) : (
                <li aria-hidden="true" className={styles.line} data-crossed="false" />
              ))}
            <li className={styles.zone} data-crossed={String(zone === from || zone === to)}>
              {zone}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
