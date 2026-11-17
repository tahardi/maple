export type TraceStep = {
  lines: [number, number];
  text: string;
};

export type Trace = {
  lang: string;
  code: string;
  steps: TraceStep[];
};
