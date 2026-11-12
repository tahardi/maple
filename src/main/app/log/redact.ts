import { isPlainObject } from './isPlainObject';

type Fields = Record<string, unknown>;

const SECRET = /token|authorization|password|secret|env/i;

export function redact(fields: Fields): Fields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !SECRET.test(key))
      .map(([key, value]) => [key, redactValue(value)]),
  );
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  return isPlainObject(value) ? redact(value) : value;
}
