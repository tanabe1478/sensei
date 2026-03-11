/** 学習プロジェクト */
export interface LearningProject {
  readonly name: string;
  readonly createdAt: string;
}

/** 日次学習ログ */
export interface LearningLog {
  readonly date: string;
  readonly focus: string;
  readonly learned: readonly string[];
  readonly unclear: readonly string[];
  readonly designDecisions: readonly string[];
  readonly nextHypothesis: string;
}

/** 間隔反復の復習アイテム (SM-2 ベース) */
export interface ReviewItem {
  readonly id: string;
  readonly topic: string;
  readonly content: string;
  readonly createdAt: string;
  readonly nextReview: string;
  readonly interval: number;
  readonly easeFactor: number;
  readonly repetitions: number;
  readonly source?: 'log' | 'experiment' | 'error' | 'manual';
}

/** 想起練習の記録 */
export interface RecallRecord {
  readonly date: string;
  readonly reviewItemId: string;
  readonly topic: string;
  readonly userResponse: string;
  readonly quality: ReviewQuality;
}

/** SM-2 の品質スコア (0-5) */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** 実験帳エントリ */
export interface Experiment {
  readonly id: string;
  readonly createdAt: string;
  readonly hypothesis: string;
  readonly method: string;
  readonly result?: string;
  readonly conclusion?: string;
  readonly completedAt?: string;
}

/** 誤り台帳エントリ */
export interface ErrorEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly category: string;
  readonly description: string;
  readonly rootCause?: string;
  readonly resolution?: string;
}

/** プロジェクト全体の進捗 */
export interface ProjectProgress {
  readonly projectName: string;
  readonly totalLogs: number;
  readonly totalReviewItems: number;
  readonly pendingReviews: number;
  readonly completedReviews: number;
  readonly overdueReviews: number;
  readonly totalExperiments: number;
  readonly pendingExperiments: number;
  readonly totalErrors: number;
  readonly learningDays: number;
  readonly lastActivityDate: string;
}
