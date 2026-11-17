import type { Card } from './card';
import type { Epic } from './epic';

export type BacklogGroup = { epic: Epic | null; cards: Card[] };
