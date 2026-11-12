export type CheckRun = { name: string; bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel'; link: string };

export type ChecksSummary = { passed: number; failed: number; pending: number; total: number; runs: CheckRun[] };
