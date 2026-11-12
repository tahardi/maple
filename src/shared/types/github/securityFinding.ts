export type FindingSeverity = 'high' | 'medium' | 'low';

export type SecurityFinding = { id: string; severity: FindingSeverity; summary: string; url: string };
