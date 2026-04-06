import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
  Battle,
  BattleCompetitor,
  BattlePhase,
  BattleStatus,
  ChallengeDifficulty,
  CompetitorStatus,
  EloRating,
  MetricResult,
  PresetChallenge,
} from '../../shared/types';

type SqlRow = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS battles (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    preset_id TEXT,
    phase TEXT NOT NULL DEFAULT 'configuring',
    status TEXT NOT NULL DEFAULT 'active',
    winner_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY,
    battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    endpoint_id INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output_dir TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    terminal_log TEXT
);

CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    weight REAL NOT NULL DEFAULT 1,
    details_json TEXT
);

CREATE TABLE IF NOT EXISTS elo_ratings (
    model_key TEXT PRIMARY KEY,
    rating REAL NOT NULL DEFAULT 1500,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    battle_count INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preset_challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    system_prompt_addendum TEXT NOT NULL DEFAULT ''
);
`;

const SEED_PRESETS: PresetChallenge[] = [
  {
    id: 'landing-page',
    title: 'Landing Page',
    description: 'Build a modern SaaS landing page with hero, features, pricing, CTA',
    difficulty: 'easy',
    systemPromptAddendum:
      'Focus on a clean, modern SaaS landing page. Include a hero section with headline and CTA, a features grid, a pricing table with 3 tiers, and a footer. Use a professional color palette.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Create a developer portfolio with projects, about, contact form',
    difficulty: 'easy',
    systemPromptAddendum:
      'Build a developer portfolio website. Include an about section, a projects grid with cards (image, title, description, tech stack tags), a skills section, and a contact form. Make it feel personal and creative.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Design an analytics dashboard with charts, stats cards, sidebar nav',
    difficulty: 'hard',
    systemPromptAddendum:
      'Create an analytics dashboard UI. Include a sidebar navigation, top stats cards (revenue, users, orders, conversion rate), a main chart area, a recent activity table, and a notifications panel. Use a dark theme.',
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce',
    description: 'Build a product listing page with filters, cart, product cards',
    difficulty: 'medium',
    systemPromptAddendum:
      'Build an e-commerce product listing page. Include a filter sidebar (category, price range, rating), a grid of product cards (image, name, price, rating, add-to-cart button), a mini cart, and pagination. Use clean, modern styling.',
  },
  {
    id: 'blog',
    title: 'Blog',
    description: 'Create a blog homepage with article cards, categories, search',
    difficulty: 'medium',
    systemPromptAddendum:
      'Create a blog homepage. Include a featured article hero, a grid of article cards (thumbnail, title, excerpt, author, date), a categories sidebar, a search bar, and pagination. Aim for readability and clean typography.',
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    description: 'Design a restaurant website with menu, reservations, gallery',
    difficulty: 'medium',
    systemPromptAddendum:
      'Design a restaurant website. Include a hero with an inviting food photo background, a menu section organized by courses, a reservation form (date, time, guests), a photo gallery, and location/hours info. Make it feel warm and appetizing.',
  },
];

let battlesDb: Database.Database | null = null;

function getBattlesDbPath(): string {
  if (app.isPackaged) {
    const userDataDir = app.getPath('userData');
    if (!existsSync(userDataDir)) {
      mkdirSync(userDataDir, { recursive: true });
    }
    return join(userDataDir, 'battles.db');
  }
  return join(app.getAppPath(), 'battles.db');
}

function getNowIso(): string {
  return new Date().toISOString();
}

function ensureDb(): Database.Database {
  if (!battlesDb) {
    throw new Error('Battles database has not been initialized');
  }
  return battlesDb;
}

// --- Init ---

export function initBattlesDb(): void {
  const dbPath = getBattlesDbPath();
  battlesDb = new Database(dbPath);
  battlesDb.pragma('journal_mode = WAL');
  battlesDb.pragma('foreign_keys = ON');
  battlesDb.exec(SCHEMA);
  seedPresets();
}

export function closeBattlesDb(): void {
  if (battlesDb) {
    battlesDb.close();
    battlesDb = null;
  }
}

// --- Row mappers ---

function rowToBattle(row: SqlRow, competitors: BattleCompetitor[] = []): Battle {
  return {
    id: String(row.id),
    prompt: String(row.prompt),
    presetId: row.preset_id ? String(row.preset_id) : undefined,
    phase: String(row.phase) as BattlePhase,
    status: String(row.status) as BattleStatus,
    competitors,
    winnerId: row.winner_id ? String(row.winner_id) : undefined,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

function rowToCompetitor(row: SqlRow): BattleCompetitor {
  return {
    id: String(row.id),
    battleId: String(row.battle_id),
    endpointId: Number(row.endpoint_id),
    modelId: String(row.model_id),
    status: String(row.status) as CompetitorStatus,
    outputDir: String(row.output_dir),
    startTime: row.start_time ? String(row.start_time) : undefined,
    endTime: row.end_time ? String(row.end_time) : undefined,
  };
}

function rowToEloRating(row: SqlRow): EloRating {
  return {
    modelKey: String(row.model_key),
    rating: Number(row.rating),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    battleCount: Number(row.battle_count),
    lastUpdated: String(row.last_updated),
  };
}

function rowToPreset(row: SqlRow): PresetChallenge {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    difficulty: String(row.difficulty) as ChallengeDifficulty,
    systemPromptAddendum: String(row.system_prompt_addendum),
  };
}

// --- Battles CRUD ---

export function createBattle(prompt: string, presetId?: string): Battle {
  const db = ensureDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO battles (id, prompt, preset_id, phase, status, created_at)
     VALUES (?, ?, ?, 'configuring', 'active', ?)`,
  ).run(id, prompt, presetId ?? null, getNowIso());
  return {
    id,
    prompt,
    presetId,
    phase: 'configuring',
    status: 'active',
    competitors: [],
    createdAt: getNowIso(),
  };
}

export function getBattle(id: string): Battle | null {
  const db = ensureDb();
  const row = db.prepare('SELECT * FROM battles WHERE id = ?').get(id) as SqlRow | undefined;
  if (!row) return null;
  const competitors = getCompetitorsForBattle(id);
  return rowToBattle(row, competitors);
}

export function updateBattle(
  id: string,
  updates: {
    phase?: BattlePhase;
    status?: BattleStatus;
    winnerId?: string;
    completedAt?: string;
  },
): void {
  const db = ensureDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.phase !== undefined) {
    sets.push('phase = ?');
    values.push(updates.phase);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.winnerId !== undefined) {
    sets.push('winner_id = ?');
    values.push(updates.winnerId);
  }
  if (updates.completedAt !== undefined) {
    sets.push('completed_at = ?');
    values.push(updates.completedAt);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE battles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

// --- Competitors CRUD ---

export function createCompetitor(
  battleId: string,
  endpointId: number,
  modelId: string,
  outputDir: string,
): BattleCompetitor {
  const db = ensureDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO competitors (id, battle_id, endpoint_id, model_id, status, output_dir)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).run(id, battleId, endpointId, modelId, outputDir);
  return {
    id,
    battleId,
    endpointId,
    modelId,
    status: 'pending',
    outputDir,
  };
}

export function updateCompetitor(
  id: string,
  updates: {
    status?: CompetitorStatus;
    startTime?: string;
    endTime?: string;
    terminalLog?: string;
  },
): void {
  const db = ensureDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.startTime !== undefined) {
    sets.push('start_time = ?');
    values.push(updates.startTime);
  }
  if (updates.endTime !== undefined) {
    sets.push('end_time = ?');
    values.push(updates.endTime);
  }
  if (updates.terminalLog !== undefined) {
    sets.push('terminal_log = ?');
    values.push(updates.terminalLog);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE competitors SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function getCompetitorsForBattle(battleId: string): BattleCompetitor[] {
  const db = ensureDb();
  const rows = db
    .prepare('SELECT * FROM competitors WHERE battle_id = ?')
    .all(battleId) as SqlRow[];
  return rows.map(rowToCompetitor);
}

// --- Scores ---

export function saveScores(competitorId: string, metrics: MetricResult[]): void {
  const db = ensureDb();
  const insert = db.prepare(
    `INSERT INTO scores (id, competitor_id, metric_name, score, weight, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const insertMany = db.transaction((items: MetricResult[]) => {
    for (const m of items) {
      insert.run(
        randomUUID(),
        competitorId,
        m.name,
        m.score,
        m.weight,
        m.details ? JSON.stringify(m.details) : null,
      );
    }
  });

  insertMany(metrics);
}

export function getScoresForCompetitor(
  competitorId: string,
): MetricResult[] {
  const db = ensureDb();
  const rows = db
    .prepare('SELECT * FROM scores WHERE competitor_id = ?')
    .all(competitorId) as SqlRow[];
  return rows.map((row) => ({
    name: String(row.metric_name),
    score: Number(row.score),
    weight: Number(row.weight),
    details: row.details_json ? String(row.details_json) : undefined,
  }));
}

// --- ELO Ratings ---

export function getEloRatings(): EloRating[] {
  const db = ensureDb();
  const rows = db
    .prepare('SELECT * FROM elo_ratings ORDER BY rating DESC')
    .all() as SqlRow[];
  return rows.map(rowToEloRating);
}

export function getEloRating(modelKey: string): EloRating {
  const db = ensureDb();
  const row = db
    .prepare('SELECT * FROM elo_ratings WHERE model_key = ?')
    .get(modelKey) as SqlRow | undefined;
  if (row) return rowToEloRating(row);
  // Auto-create with default rating
  db.prepare(
    `INSERT INTO elo_ratings (model_key, rating, wins, losses, draws, battle_count, last_updated)
     VALUES (?, 1500, 0, 0, 0, 0, ?)`,
  ).run(modelKey, getNowIso());
  return {
    modelKey,
    rating: 1500,
    wins: 0,
    losses: 0,
    draws: 0,
    battleCount: 0,
    lastUpdated: getNowIso(),
  };
}

export function updateElo(
  winnerKey: string,
  loserKey: string,
  isDraw = false,
  incrementBattleCount = true,
): { winnerDelta: number; loserDelta: number } {
  const db = ensureDb();
  const K = 32;

  const winner = getEloRating(winnerKey);
  const loser = getEloRating(loserKey);

  const expectedWinner = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const actualWinner = isDraw ? 0.5 : 1;
  const actualLoser = isDraw ? 0.5 : 0;

  const winnerDelta = Math.round(K * (actualWinner - expectedWinner));
  const loserDelta = Math.round(K * (actualLoser - expectedLoser));

  const now = getNowIso();
  const battleCountIncrement = incrementBattleCount ? 1 : 0;

  db.prepare(
    `UPDATE elo_ratings
     SET rating = rating + ?, wins = wins + ?, draws = draws + ?, battle_count = battle_count + ?, last_updated = ?
     WHERE model_key = ?`,
  ).run(winnerDelta, isDraw ? 0 : 1, isDraw ? 1 : 0, battleCountIncrement, now, winnerKey);

  db.prepare(
    `UPDATE elo_ratings
     SET rating = rating + ?, losses = losses + ?, draws = draws + ?, battle_count = battle_count + ?, last_updated = ?
     WHERE model_key = ?`,
  ).run(loserDelta, isDraw ? 0 : 1, isDraw ? 1 : 0, battleCountIncrement, now, loserKey);

  return { winnerDelta, loserDelta };
}

/** Increment battle_count by 1 for a single model key. */
export function incrementBattleCount(modelKey: string): void {
  const db = ensureDb();
  // Ensure the model row exists
  getEloRating(modelKey);
  db.prepare(
    `UPDATE elo_ratings SET battle_count = battle_count + 1, last_updated = ? WHERE model_key = ?`,
  ).run(getNowIso(), modelKey);
}

// --- Gallery ---

export function getGallery(limit = 50, offset = 0): Battle[] {
  const db = ensureDb();
  const rows = db
    .prepare(
      `SELECT * FROM battles
       WHERE status IN ('completed', 'cancelled')
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as SqlRow[];

  return rows.map((row) => {
    const competitors = getCompetitorsForBattle(String(row.id));
    return rowToBattle(row, competitors);
  });
}

// --- Gallery ---

export function upsertGalleryEntry(battleId: string, title: string): void {
  const db = ensureDb();
  // gallery metadata is lightweight — just ensure the battle exists and has a title excerpt
  // The battles table itself IS the gallery; this is a no-op hook for future thumbnail storage
  db.prepare(
    `UPDATE battles SET prompt = prompt WHERE id = ?`,
  ).run(battleId);
  // Title stored as the first 80 chars of prompt — already set on create.
  // This function exists so battle-orchestrator can signal gallery readiness without
  // needing a separate table right now. Extend here when thumbnails are added.
  void title; // suppress unused warning
}

// --- Presets ---

export function getPreset(id: string): PresetChallenge | null {
  const db = ensureDb();
  const row = db.prepare('SELECT * FROM preset_challenges WHERE id = ?').get(id) as SqlRow | undefined;
  return row ? rowToPreset(row) : null;
}

export function getPresets(): PresetChallenge[] {
  const db = ensureDb();
  const rows = db.prepare('SELECT * FROM preset_challenges').all() as SqlRow[];
  return rows.map(rowToPreset);
}

export function seedPresets(): void {
  const db = ensureDb();
  const existing = db
    .prepare('SELECT COUNT(*) as count FROM preset_challenges')
    .get() as { count: number };

  if (existing.count > 0) return;

  const insert = db.prepare(
    `INSERT INTO preset_challenges (id, title, description, difficulty, system_prompt_addendum)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const insertAll = db.transaction(() => {
    for (const preset of SEED_PRESETS) {
      insert.run(
        preset.id,
        preset.title,
        preset.description,
        preset.difficulty,
        preset.systemPromptAddendum,
      );
    }
  });

  insertAll();
}
