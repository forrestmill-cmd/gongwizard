// Core TypeScript types for GongWizard — shared across API routes, components, and utilities.

export interface GongCall {
  id: string;
  title: string;
  started: string; // ISO datetime
  duration: number; // seconds
  url?: string; // Gong call URL
  direction?: string;
  parties: GongParty[];
  topics: string[];
  trackers: string[];
  trackerData?: GongTracker[];
  brief: string;
  keyPoints: string[];
  actionItems: string[];
  outline: OutlineSection[];
  questions: GongQuestion[];
  interactionStats: InteractionStats | null;
  context: GongRawContextItem[];
  accountName: string;
  accountIndustry: string;
  accountWebsite: string;
  internalSpeakerCount: number;
  externalSpeakerCount: number;
  talkRatio?: number;
}

export interface GongParty {
  id?: string;
  speakerId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  emailAddress?: string;
  affiliation?: string; // 'Internal' | 'External' | 'Unknown'
  userId?: string;
  methods?: string[];
}

export interface GongTracker {
  id?: string;
  name: string;
  count?: number;
  occurrences: TrackerOccurrence[];
}

export interface TrackerOccurrence {
  startTime?: number; // original seconds from Gong
  startTimeMs: number; // converted to milliseconds
  speakerId?: string;
  phrase?: string;
}

export interface OutlineSection {
  name: string;
  startTimeMs: number; // converted from seconds × 1000
  durationMs: number; // converted from seconds × 1000
  items: OutlineItem[];
}

export interface OutlineItem {
  text: string;
  startTimeMs: number;
  durationMs: number;
}

export interface GongQuestion {
  text?: string;
  speakerId?: string;
  startTime?: number;
}

export interface InteractionStats {
  talkRatio?: number;
  longestMonologue?: number;
  interactivity?: number;
  patience?: number;
  questionRate?: number;
}

// Session data stored in sessionStorage
export interface GongSession {
  authHeader: string;
  users: GongUser[];
  trackers: SessionTracker[];
  workspaces: GongWorkspace[];
  internalDomains: string[];
  baseUrl: string;
  fromDate?: string;
  toDate?: string;
}

export interface GongUser {
  id: string;
  emailAddress: string;
  firstName?: string;
  lastName?: string;
  title?: string;
}

export interface SessionTracker {
  id: string;
  name: string;
}

export interface GongWorkspace {
  id: string;
  name: string;
}

// Transcript types
export interface TranscriptMonologue {
  speakerId: string;
  sentences: TranscriptSentence[];
}

export interface TranscriptSentence {
  text: string;
  start: number; // milliseconds
  end?: number; // milliseconds
}

// Analysis types (Phase 3 — defined now for forward compatibility)
export interface ScoredCall {
  callId: string;
  score: number; // 0-10
  reason: string;
  relevantSections: string[]; // outline section names
}

export interface AnalysisFinding {
  quote: string;
  timestamp: string;
  context: string;
  significance: 'high' | 'medium' | 'low';
  findingType: 'objection' | 'need' | 'competitive' | 'question' | 'feedback';
  callId: string;
  callTitle: string;
  account: string;
}

export interface SynthesisTheme {
  theme: string;
  frequency: number;
  representativeQuotes: string[];
  callIds: string[];
}

// ── Raw Gong API response shapes ─────────────────────────────────────────────
// Loosely-structured external JSON that the proxy routes normalize into the
// strict interfaces above. Optional everywhere because Gong omits empty fields.

export interface GongRawField {
  name?: string;
  value?: unknown;
}

export interface GongRawContextObject {
  objectType?: string;
  objectId?: string | number;
  fields?: GongRawField[];
}

export interface GongRawContextItem {
  objects?: GongRawContextObject[];
}

export interface GongRawOutlineItem {
  text?: string;
  startTime?: number;
  duration?: number;
}

export interface GongRawOutlineSection {
  name?: string;
  startTime?: number;
  duration?: number;
  items?: GongRawOutlineItem[];
}

export interface GongRawTrackerOccurrence {
  startTime?: number;
  speakerId?: string;
  phrase?: string;
}

export interface GongRawTracker {
  id?: string;
  name?: string;
  count?: number;
  occurrences?: GongRawTrackerOccurrence[];
}

export interface GongRawExtensiveCall {
  id?: string;
  title?: string;
  started?: string;
  duration?: number;
  metaData?: {
    id?: string;
    title?: string;
    started?: string;
    duration?: number;
    url?: string;
    direction?: string;
  };
  parties?: GongParty[];
  content?: {
    topics?: Array<{ name?: string } | string>;
    trackers?: GongRawTracker[];
    brief?: string;
    keyPoints?: Array<{ text?: string } | string>;
    actionItems?: Array<{ snippet?: string } | string>;
    structure?: GongRawOutlineSection[];
    questions?: GongQuestion[];
  };
  interaction?: InteractionStats | null;
  context?: GongRawContextItem[];
}

export interface GongRawBasicCall {
  id?: string;
  title?: string;
  started?: string;
  duration?: number;
}

export interface GongPagedResponse<T> {
  calls?: T[];
  records?: { cursor?: string };
}
