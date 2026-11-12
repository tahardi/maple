import type { Card } from './card';

export type Sprint = { id: number; name: string; startDate: string; endDate: string; cards: Card[] };
