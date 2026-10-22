export type JiraStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';
export type Blocker = { key: string; status: JiraStatus };
export type Card = {
  key: string;
  summary: string;
  status: JiraStatus;
  points: number | null;
  labels: string[];
  blockedBy: Blocker[];
  descriptionMd: string;
  url: string;
};
export type BacklogGroup = { epic: { key: string; summary: string } | null; cards: Card[] };
export type Sprint = { id: number; name: string; startDate: string; endDate: string; cards: Card[] };
export type Report = { kind: 'bug' | 'feature'; title: string; description: string };
export type Filed = { key: string; url: string };
