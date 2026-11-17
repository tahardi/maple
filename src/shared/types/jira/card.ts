import type { JiraStatus } from './jiraStatus';
import type { Epic } from './epic';

export type Blocker = { key: string; status: JiraStatus };

export type Card = {
  key: string;
  summary: string;
  status: JiraStatus;
  points: number | null;
  labels: string[];
  blockedBy: Blocker[];
  epic: Epic | null;
  descriptionMd: string;
  url: string;
};
