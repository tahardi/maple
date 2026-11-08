function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function dayName(at: Date): string {
  return `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1, 2)}-${pad(at.getDate(), 2)}`;
}
