import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  LearningProject,
  LearningLog,
  ReviewItem,
  RecallRecord,
  Experiment,
  ErrorEntry,
  ProjectProgress,
} from './types.js';
import { getDueItems, getOverdueItems } from './spaced-repetition.js';

/** JSON ファイルベースの学習データストア */
export class LearningStore {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    mkdirSync(join(basePath, 'projects'), { recursive: true });
    mkdirSync(join(basePath, 'global'), { recursive: true });
  }

  // --- プロジェクト管理 ---

  listProjects(): LearningProject[] {
    const projectsPath = join(this.basePath, 'projects');
    if (!existsSync(projectsPath)) return [];

    return readdirSync(projectsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const metaPath = join(projectsPath, d.name, 'meta.json');
        if (existsSync(metaPath)) {
          return readJson<LearningProject>(metaPath);
        }
        return { name: d.name, createdAt: new Date().toISOString() };
      });
  }

  createProject(name: string): LearningProject {
    const projectDir = this.projectDir(name);
    mkdirSync(join(projectDir, 'logs'), { recursive: true });
    mkdirSync(join(projectDir, 'recalls'), { recursive: true });
    mkdirSync(join(projectDir, 'experiments'), { recursive: true });
    mkdirSync(join(projectDir, 'errors'), { recursive: true });

    const project: LearningProject = {
      name,
      createdAt: new Date().toISOString(),
    };
    writeJson(join(projectDir, 'meta.json'), project);
    writeJson(join(projectDir, 'reviews.json'), []);
    return project;
  }

  ensureProject(name: string): void {
    if (!existsSync(this.projectDir(name))) {
      this.createProject(name);
    }
  }

  // --- 学習ログ ---

  addLog(project: string, log: LearningLog): void {
    this.ensureProject(project);
    const logPath = join(this.projectDir(project), 'logs', `${log.date}.json`);
    writeJson(logPath, log);
  }

  getLog(project: string, date: string): LearningLog | null {
    const logPath = join(this.projectDir(project), 'logs', `${date}.json`);
    return existsSync(logPath) ? readJson<LearningLog>(logPath) : null;
  }

  getLatestLog(project: string): LearningLog | null {
    const logsDir = join(this.projectDir(project), 'logs');
    if (!existsSync(logsDir)) return null;

    const files = readdirSync(logsDir)
      .filter((f: string) => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;
    return readJson<LearningLog>(join(logsDir, files[0]));
  }

  getLogCount(project: string): number {
    const logsDir = join(this.projectDir(project), 'logs');
    if (!existsSync(logsDir)) return 0;
    return readdirSync(logsDir).filter((f: string) => f.endsWith('.json')).length;
  }

  // --- 復習アイテム ---

  getReviewItems(project: string): ReviewItem[] {
    const path = join(this.projectDir(project), 'reviews.json');
    return existsSync(path) ? readJson<ReviewItem[]>(path) : [];
  }

  addReviewItem(project: string, item: ReviewItem): void {
    this.ensureProject(project);
    const items = this.getReviewItems(project);
    writeJson(join(this.projectDir(project), 'reviews.json'), [...items, item]);
  }

  updateReviewItem(project: string, id: string, updates: Partial<ReviewItem>): void {
    const items = this.getReviewItems(project);
    const updated = items.map((item) => (item.id === id ? { ...item, ...updates } : item));
    writeJson(join(this.projectDir(project), 'reviews.json'), updated);
  }

  removeReviewItem(project: string, id: string): void {
    const items = this.getReviewItems(project);
    writeJson(
      join(this.projectDir(project), 'reviews.json'),
      items.filter((item) => item.id !== id)
    );
  }

  // --- 想起練習記録 ---

  addRecallRecord(project: string, record: RecallRecord): void {
    this.ensureProject(project);
    const path = join(this.projectDir(project), 'recalls', `${record.date}.json`);
    const existing = existsSync(path) ? readJson<RecallRecord[]>(path) : [];
    writeJson(path, [...existing, record]);
  }

  // --- 実験帳 ---

  getExperiments(project: string): Experiment[] {
    const dir = join(this.projectDir(project), 'experiments');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => readJson<Experiment>(join(dir, f)))
      .sort(
        (a: Experiment, b: Experiment) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  addExperiment(project: string, experiment: Experiment): void {
    this.ensureProject(project);
    writeJson(join(this.projectDir(project), 'experiments', `${experiment.id}.json`), experiment);
  }

  updateExperiment(project: string, id: string, updates: Partial<Experiment>): void {
    const path = join(this.projectDir(project), 'experiments', `${id}.json`);
    if (!existsSync(path)) return;
    const experiment = readJson<Experiment>(path);
    writeJson(path, { ...experiment, ...updates });
  }

  // --- 誤り台帳 ---

  getErrors(project: string): ErrorEntry[] {
    const dir = join(this.projectDir(project), 'errors');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => readJson<ErrorEntry>(join(dir, f)))
      .sort(
        (a: ErrorEntry, b: ErrorEntry) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  addError(project: string, entry: ErrorEntry): void {
    this.ensureProject(project);
    writeJson(join(this.projectDir(project), 'errors', `${entry.id}.json`), entry);
  }

  // --- 進捗 ---

  getProgress(project: string): ProjectProgress {
    this.ensureProject(project);
    const reviewItems = this.getReviewItems(project);
    const experiments = this.getExperiments(project);
    const errors = this.getErrors(project);
    const now = new Date();

    const dueItems = getDueItems(reviewItems, now);
    const overdueItems = getOverdueItems(reviewItems, now);
    const latestLog = this.getLatestLog(project);

    return {
      projectName: project,
      totalLogs: this.getLogCount(project),
      totalReviewItems: reviewItems.length,
      pendingReviews: dueItems.length,
      completedReviews: reviewItems.filter((i) => i.repetitions > 0).length,
      overdueReviews: overdueItems.length,
      totalExperiments: experiments.length,
      pendingExperiments: experiments.filter((e) => !e.completedAt).length,
      totalErrors: errors.length,
      learningDays: this.getLogCount(project),
      lastActivityDate: latestLog?.date || 'なし',
    };
  }

  // --- ユーティリティ ---

  private projectDir(name: string): string {
    return join(this.basePath, 'projects', name);
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path: string, data: unknown): void {
  const dir = join(path, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}
