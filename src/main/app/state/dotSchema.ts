import type { Dot } from '@shared/types/tabs/dot';
import { z } from 'zod';

export const dotSchema = z.enum({
  working: 'working',
  waiting: 'waiting',
  ready: 'ready',
  idle: 'idle',
  merged: 'merged',
} satisfies { [D in Dot]: D });
