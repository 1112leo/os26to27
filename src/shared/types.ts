export type EventPhase = 'A' | 'B' | 'C';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface EventConfig {
  phase: EventPhase;
  typingEnabled: boolean;
  submissionsEnabled: boolean;
}

export interface LetterSubmission {
  nickname: string;
  content: string;
  consentToPublish: boolean;
  submissionKey: string;
}

export interface Letter {
  id: string;
  nickname: string | null;
  content: string;
  published_content: string | null;
  consent_to_publish: number;
  status: ReviewStatus;
  publish_order: number | null;
  submission_key: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface PublicLetter {
  id: string;
  nickname: string;
  content: string;
  order: number | null;
}

export interface PublicData {
  schemaVersion: 1;
  publishedAt: string | null;
  letters: PublicLetter[];
}

export interface TypingResult {
  id: string;
  participantId: string;
  displayName: string;
  challengeId: string;
  elapsedMs: number;
  speed: number;
  errors: number;
  score: number;
  completedAt: string;
  prizeReceived: boolean;
  practice: boolean;
}
