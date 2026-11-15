import type { Severity } from '@shared/types/findings/severity';
import type { Tone } from '@renderer/shell/blocks/tone';

export const SEVERITY_TONES: Record<Severity, Tone | 'neutral'> = { high: 'danger', medium: 'warning', low: 'neutral' };
