import { z } from 'zod';

export const tabIdArg = z.string().min(1).max(100);
export const projectKeyArg = z.string().regex(/^[A-Z][A-Z0-9]+$/);
export const cardKeyArg = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/);
export const sizeArg = z.number().int().min(1).max(10_000);
