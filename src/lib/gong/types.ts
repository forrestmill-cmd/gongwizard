export interface GongUser {
  id: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  title: string;
  active: boolean;
  created: string;
  settings?: {
    webConferencesRecorded: boolean;
  };
}

export interface GongTracker {
  trackerId: string;
  trackerName: string;
}

export interface GongWorkspace {
  id: string;
  name: string;
  description?: string;
}

export interface GongCallParty {
  speakerId: string;
  name: string;
  title: string;
  emailAddress: string;
  affiliation: 'Internal' | 'External' | 'Unknown';
  phoneNumber?: string;
  userId?: string;
  context?: GongContextObject[];
  methods?: string[];
}

export interface GongContextObject {
  system?: string;
  objectType?: string;
  objectId?: string;
  fields?: Array<{
    name: string;
    value: string;
  }>;
  objects?: GongContextObject[];
}

export interface GongCallContent {
  topics?: Array<{
    name: string;
    duration: number;
  }>;
  trackers?: Array<{
    id: string;
    name: string;
    count: number;
    occurrences?: Array<{
      startTime: number;
      speakerId: string;
    }>;
  }>;
  brief?: string;
  keyPoints?: Array<{ text: string }>;
  actionItems?: Array<{
    snippet: string;
    speakerName?: string;
  }>;
  outline?: Array<string | Record<string, string>>;
  structure?: Array<{
    name: string;
    duration: number;
    startTime: number;
  }>;
}

export interface GongInteractionStats {
  talkRatio?: number;
  interactivity?: number;
  longestMonologue?: {
    duration: number;
    speakerId: string;
  };
  patience?: number;
  questionRate?: {
    total: number;
    perMinute: number;
  };
}

export interface GongCallMetaData {
  id: string;
  url: string;
  title: string;
  started: string;
  duration: number;
  primaryUserId?: string;
  direction?: 'Inbound' | 'Outbound' | 'Conference' | 'Unknown';
  scope?: string;
  media?: string;
  language?: string;
  workspaceId?: string;
  meetingUrl?: string;
  isPrivate?: boolean;
  calendarEventId?: string;
  system?: string;
}

export interface GongCall {
  metaData: GongCallMetaData;
  parties?: GongCallParty[];
  content?: GongCallContent;
  context?: GongContextObject[];
  interaction?: GongInteractionStats;
  collaboration?: unknown;
  media?: unknown;
}

export interface GongMonologue {
  speakerId: string;
  topic?: string;
  sentences: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface GongCallTranscript {
  callId: string;
  transcript: GongMonologue[];
}

export interface GongPaginatedResponse<T> {
  records: {
    totalRecords?: number;
    currentPageSize?: number;
    currentPageNumber?: number;
    cursor?: string;
  };
  requestId: string;
  [key: string]: unknown;
}

export interface ProcessedCall {
  id: string;
  title: string;
  date: string;
  dateRaw: string;
  duration: number;
  durationFormatted: string;
  url: string;
  speakers: ProcessedSpeaker[];
  internalCount: number;
  externalCount: number;
  topics: string[];
  trackers: ProcessedTracker[];
  brief: string;
  keyPoints: string[];
  actionItems: string[];
  interactionStats: {
    talkRatio: number | null;
    longestMonologue: number | null;
    patience: number | null;
  };
  accountName: string;
  accountIndustry: string;
  direction: string;
  selected: boolean;
}

export interface ProcessedSpeaker {
  speakerId: string;
  name: string;
  firstName: string;
  title: string;
  email: string;
  affiliation: 'internal' | 'external';
}

export interface ProcessedTracker {
  id: string;
  name: string;
  count: number;
}

export interface ConnectResult {
  users: GongUser[];
  trackers: GongTracker[];
  workspaces: GongWorkspace[];
  internalDomains: string[];
  baseUrl: string;
}

export interface GongSession {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  users: GongUser[];
  trackers: GongTracker[];
  workspaces: GongWorkspace[];
  internalDomains: string[];
  connectedAt: string;
}

export interface ExportOptions {
  format: 'markdown' | 'xml' | 'jsonl';
  removeFiller: boolean;
  condenseInternal: boolean;
  includeMetadata: boolean;
  includeAiBrief: boolean;
  includeInteractionStats: boolean;
}
