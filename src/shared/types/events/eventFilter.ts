export type EventFilter = {
  from: string;
  to: string;
  card?: string;
  session?: string;
  types?: readonly string[];
};
