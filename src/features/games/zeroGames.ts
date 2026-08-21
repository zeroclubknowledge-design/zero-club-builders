import { getSudoku } from "sudoku-gen";

export type ZeroGameType = "sudoku" | "words";
export type ZeroGameDifficulty = "easy" | "medium" | "hard" | "expert";
export type ZeroGameRewardType = "offer" | "cash";
export type ZeroGameVisibility = "public" | "link" | "followers";

export type ZeroGameProfile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

export type ZeroGameCompetition = {
  id: string;
  creator_id: string;
  game_type: ZeroGameType;
  title: string;
  profession?: string | null;
  difficulty: ZeroGameDifficulty;
  visibility: ZeroGameVisibility;
  reward_type: ZeroGameRewardType;
  offer_type?: string | null;
  offer_label?: string | null;
  prize_amount: number;
  max_players: number;
  duration_seconds: number;
  status: "open" | "countdown" | "active" | "completed" | "cancelled";
  starts_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  winner_id?: string | null;
  puzzle: {
    puzzle?: string;
    difficulty?: ZeroGameDifficulty;
    size?: number;
    letters?: string[];
    words?: string[];
  };
  share_code: string;
  created_at: string;
  creator?: ZeroGameProfile | null;
  winner?: ZeroGameProfile | null;
  players?: Array<{ count: number }>;
};

export type ZeroGamePlayer = {
  id: string;
  competition_id: string;
  profile_id: string;
  status: "joined" | "ready" | "playing" | "finished";
  progress: number;
  mistakes: number;
  score: number;
  finished_at?: string | null;
  joined_at: string;
  profile?: ZeroGameProfile | null;
};

export type ZeroGamePresence = {
  competition_id: string;
  profile_id: string;
  last_seen_at: string;
};

export type ZeroGameReward = {
  id: string;
  competition_id: string;
  winner_id: string;
  reward_type: ZeroGameRewardType;
  amount: number;
  offer_type?: string | null;
  offer_label?: string | null;
  redemption_code?: string | null;
  status: "unlocked" | "redeemed";
  expires_at?: string | null;
};

export const ZERO_GAME_PROFESSIONS = [
  "Web Developer",
  "Software Engineer",
  "Data Scientist",
  "Product Manager",
  "UI/UX Designer",
  "Graphic Designer",
  "Digital Marketer",
  "Content Writer",
  "Cloud Architect",
  "DevOps Engineer",
  "Cybersecurity Analyst",
  "AI Researcher",
] as const;

export const ZERO_GAME_OFFERS = [
  { id: "bootcamp_discount", label: "15% off one Bootcamp", detail: "Use on an eligible Zero Club Bootcamp within 30 days." },
  { id: "store_credit", label: "Zero Store reward voucher", detail: "Unlock a verified voucher for an eligible Zero Store purchase." },
  { id: "membership_pass", label: "7-day Premium access pass", detail: "Try premium tools and increased platform limits for seven days." },
  { id: "profile_spotlight", label: "24-hour profile spotlight", detail: "Give your builder profile a day of additional discovery." },
] as const;

const WORD_BANK: Record<string, string[]> = {
  "Web Developer": [
    "HTML", "CSS", "JAVASCRIPT", "REACT", "NODEJS", "FRONTEND", "BACKEND", "API", "BROWSER", "WEBPACK", "COMPONENT", "ROUTER",
    "TYPESCRIPT", "RESPONSIVE", "SEMANTIC", "DOM", "FETCH", "PROMISE", "HOOKS", "STATE", "PROPS", "MODULE", "BUNDLE", "CACHE",
    "COOKIE", "SESSION", "ENDPOINT", "RENDER", "DEPLOY", "GIT", "ACCESSIBLE", "GRID", "FLEXBOX", "SERVER", "CLIENT", "WEBSOCKET",
  ],
  "Software Engineer": [
    "ALGORITHM", "DEBUG", "REFACTOR", "FUNCTION", "OBJECT", "TESTING", "VERSION", "REPOSITORY", "COMMIT", "REVIEW", "PATTERN", "SYSTEM",
    "ABSTRACTION", "INTERFACE", "ITERATION", "RECURSION", "COMPILER", "RUNTIME", "THREAD", "PROCESS", "MEMORY", "QUEUE", "STACK", "GRAPH",
    "BRANCH", "MERGE", "RELEASE", "MODULE", "PACKAGE", "DEPENDENCY", "PROTOCOL", "SCALABLE", "RELIABLE", "LATENCY", "DATABASE", "ARCHITECTURE",
  ],
  "Data Scientist": [
    "PYTHON", "PANDAS", "MODEL", "DATASET", "ANALYSIS", "BIAS", "VARIANCE", "MATRIX", "FEATURE", "CLUSTER", "REGRESSION", "METRIC",
    "NUMPY", "SAMPLE", "MEDIAN", "MEAN", "OUTLIER", "CLEANING", "LABEL", "TARGET", "TRAINING", "VALIDATION", "PREDICT", "CORRELATION",
    "DASHBOARD", "QUERY", "TABLE", "VECTOR", "NOTEBOOK", "PIPELINE", "FORECAST", "PROBABILITY", "STATISTICS", "HYPOTHESIS", "INSIGHT", "VISUALIZE",
  ],
  "Product Manager": [
    "ROADMAP", "SPRINT", "AGILE", "SCRUM", "METRICS", "BACKLOG", "VISION", "RESEARCH", "LAUNCH", "OUTCOME", "PRIORITY", "DISCOVERY",
    "STRATEGY", "PERSONA", "JOURNEY", "FEEDBACK", "PROBLEM", "SOLUTION", "SCOPE", "MILESTONE", "RELEASE", "ADOPTION", "RETENTION", "CHURN",
    "STAKEHOLDER", "INTERVIEW", "PROTOTYPE", "EXPERIMENT", "ASSUMPTION", "IMPACT", "EFFORT", "PLANNING", "DELIVERY", "ITERATION", "VALUE", "MARKET",
  ],
  "UI/UX Designer": [
    "WIREFRAME", "PROTOTYPE", "PERSONA", "USABILITY", "LAYOUT", "JOURNEY", "RESEARCH", "ACCESSIBLE", "INTERFACE", "FLOW", "DESIGN", "INSIGHT",
    "EMPATHY", "AFFORDANCE", "HIERARCHY", "CONTRAST", "SPACING", "TYPOGRAPHY", "COMPONENT", "VARIANT", "TOKEN", "GRID", "MOTION", "FEEDBACK",
    "HEURISTIC", "INTERVIEW", "SURVEY", "SCENARIO", "WORKFLOW", "NAVIGATION", "INCLUSIVE", "CONSISTENCY", "ITERATION", "SITEMAP", "FINDABILITY", "IDEATION",
  ],
  "Graphic Designer": [
    "TYPOGRAPHY", "MOCKUP", "KERNING", "VECTOR", "CONTRAST", "CANVAS", "BEZIER", "OPACITY", "PALETTE", "LAYER", "POSTER", "BRAND",
    "RASTER", "GRADIENT", "TEXTURE", "COMPOSITION", "ALIGNMENT", "BALANCE", "HIERARCHY", "WHITESPACE", "SATURATION", "HUE", "MASK", "CROP",
    "BLEED", "MARGIN", "SYMBOL", "LOGO", "ICON", "SKETCH", "ILLUSTRATE", "TYPEFACE", "LIGATURE", "PANTONE", "EXPORT", "RESOLUTION",
  ],
  "Digital Marketer": [
    "CAMPAIGN", "AUDIENCE", "CONVERSION", "FUNNEL", "CONTENT", "CHANNEL", "INSIGHT", "TARGET", "KEYWORD", "TRAFFIC", "GROWTH", "REACH",
    "ENGAGEMENT", "LANDING", "ANALYTICS", "SEGMENT", "PERSONA", "LEAD", "ATTRIBUTION", "RETARGET", "ORGANIC", "PAID", "SEARCH", "SOCIAL",
    "EMAIL", "COPY", "BRAND", "IMPRESSION", "CLICK", "BUDGET", "BID", "ROAS", "REVENUE", "RETENTION", "AWARENESS", "OPTIMIZE",
  ],
  "Content Writer": [
    "HEADLINE", "DRAFT", "EDIT", "RESEARCH", "NARRATIVE", "OUTLINE", "VOICE", "ARTICLE", "READER", "CLARITY", "STORY", "PUBLISH",
    "ANGLE", "HOOK", "TONE", "CONTEXT", "THESIS", "PARAGRAPH", "CAPTION", "SCRIPT", "INTERVIEW", "SOURCE", "QUOTE", "FACTCHECK",
    "REVISION", "GRAMMAR", "STYLE", "PACING", "METAPHOR", "KEYWORD", "BRIEF", "AUDIENCE", "EDITORIAL", "NEWSLETTER", "PROOFREAD", "STRUCTURE",
  ],
  "Cloud Architect": [
    "SERVER", "STORAGE", "NETWORK", "REGION", "SCALING", "SECURITY", "BACKUP", "INSTANCE", "DATABASE", "LATENCY", "CLUSTER", "DEPLOY",
    "VIRTUAL", "SUBNET", "GATEWAY", "FIREWALL", "BALANCER", "CONTAINER", "SERVERLESS", "FUNCTION", "REPLICA", "FAILOVER", "UPTIME", "MONITOR",
    "ENCRYPT", "IDENTITY", "POLICY", "BILLING", "CAPACITY", "RESILIENCE", "RECOVERY", "ENDPOINT", "ROUTING", "CACHE", "QUEUE", "ARCHIVE",
  ],
  "DevOps Engineer": [
    "PIPELINE", "DOCKER", "DEPLOY", "MONITOR", "AUTOMATE", "CONTAINER", "ROLLBACK", "RELEASE", "SCRIPT", "UPTIME", "LOGGING", "BUILD",
    "KUBERNETES", "CLUSTER", "RUNNER", "ARTIFACT", "REGISTRY", "MANIFEST", "HELM", "TERRAFORM", "ANSIBLE", "SECRETS", "ALERT", "METRICS",
    "TRACING", "PROVISION", "SCALING", "BRANCH", "MERGE", "STAGING", "PRODUCTION", "INCIDENT", "RECOVERY", "VERSION", "PACKAGE", "WORKFLOW",
  ],
  "Cybersecurity Analyst": [
    "FIREWALL", "THREAT", "MALWARE", "PHISHING", "ENCRYPT", "AUDIT", "ACCESS", "IDENTITY", "BREACH", "PATCH", "RISK", "SECURE",
    "FORENSICS", "EXPLOIT", "VULNERABLE", "AUTHENTICATE", "PASSWORD", "TOKEN", "CERTIFICATE", "PROTOCOL", "NETWORK", "PAYLOAD", "SANDBOX", "INCIDENT",
    "RESPONSE", "BACKUP", "ZEROTRUST", "MONITOR", "DETECT", "PREVENT", "POLICY", "PRIVACY", "COMPLIANCE", "HARDEN", "SCAN", "SIEM",
  ],
  "AI Researcher": [
    "NEURAL", "MODEL", "TRAINING", "TOKEN", "PROMPT", "DATASET", "INFERENCE", "AGENT", "VECTOR", "EVALUATE", "WEIGHTS", "ALIGNMENT",
    "TRANSFORMER", "ATTENTION", "EMBEDDING", "ENCODER", "DECODER", "TENSOR", "GRADIENT", "LOSS", "EPOCH", "BATCH", "OPTIMIZER", "BENCHMARK",
    "REWARD", "POLICY", "REASONING", "MULTIMODAL", "ROBOTICS", "CLASSIFY", "PREDICT", "RETRIEVAL", "CONTEXT", "FINETUNE", "SAMPLING", "RESEARCH",
  ],
};

const recentWordSets = new Map<string, Set<string>>();

const DIRECTIONS = [
  [0, 1], [1, 0], [1, 1], [1, -1],
  [0, -1], [-1, 0], [-1, -1], [-1, 1],
] as const;

const shuffle = <T,>(values: T[]) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const WORDS_DIFFICULTY_CONFIG: Record<ZeroGameDifficulty, { size: number; count: number }> = {
  easy: { size: 10, count: 5 },
  medium: { size: 11, count: 6 },
  hard: { size: 12, count: 8 },
  expert: { size: 13, count: 10 },
};

export function generateWordsPuzzle(profession: string, difficulty: ZeroGameDifficulty = "medium", requestedSize?: number) {
  const config = WORDS_DIFFICULTY_CONFIG[difficulty] || WORDS_DIFFICULTY_CONFIG.medium;
  const size = requestedSize || config.size;
  const historyKey = `${profession}:${difficulty}:${size}`;
  const previousWords = recentWordSets.get(historyKey) || new Set<string>();
  const eligibleWords = shuffle(WORD_BANK[profession] || WORD_BANK["Software Engineer"])
    .filter((word) => word.length <= size);
  const freshWords = eligibleWords.filter((word) => !previousWords.has(word));
  const repeatedWords = eligibleWords.filter((word) => previousWords.has(word));
  const words = [...freshWords, ...repeatedWords].slice(0, config.count);
  recentWordSets.set(historyKey, new Set(words));
  const grid = Array<string | null>(size * size).fill(null);
  const placed: string[] = [];
  const placements: Array<{ word: string; path: number[] }> = [];

  for (const word of words) {
    let wasPlaced = false;
    for (let attempt = 0; attempt < 240 && !wasPlaced; attempt += 1) {
      const [rowStep, columnStep] = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * size);
      const column = Math.floor(Math.random() * size);
      const endRow = row + rowStep * (word.length - 1);
      const endColumn = column + columnStep * (word.length - 1);
      if (endRow < 0 || endRow >= size || endColumn < 0 || endColumn >= size) continue;

      const cells = Array.from({ length: word.length }, (_, index) =>
        (row + rowStep * index) * size + column + columnStep * index,
      );
      if (cells.some((cell, index) => grid[cell] && grid[cell] !== word[index])) continue;
      cells.forEach((cell, index) => { grid[cell] = word[index]; });
      placed.push(word);
      placements.push({ word, path: cells });
      wasPlaced = true;
    }
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letters = grid.map((letter) => letter || alphabet[Math.floor(Math.random() * alphabet.length)]) as string[];
  return { size, letters, words: placed, placements };
}

export function generatePracticeSudoku(difficulty: ZeroGameDifficulty = "easy") {
  return getSudoku(difficulty);
}

export function getSelectionPath(start: number, end: number, size: number) {
  const startRow = Math.floor(start / size);
  const startColumn = start % size;
  const endRow = Math.floor(end / size);
  const endColumn = end % size;
  const rowDistance = endRow - startRow;
  const columnDistance = endColumn - startColumn;
  const isStraight = rowDistance === 0 || columnDistance === 0 || Math.abs(rowDistance) === Math.abs(columnDistance);
  if (!isStraight) return [];
  const length = Math.max(Math.abs(rowDistance), Math.abs(columnDistance)) + 1;
  const rowStep = Math.sign(rowDistance);
  const columnStep = Math.sign(columnDistance);
  return Array.from({ length }, (_, index) =>
    (startRow + rowStep * index) * size + startColumn + columnStep * index,
  );
}

export function hasSudokuConflict(board: string[], index: number) {
  const value = board[index];
  if (!value) return false;
  const row = Math.floor(index / 9);
  const column = index % 9;
  for (let cursor = 0; cursor < 81; cursor += 1) {
    if (cursor === index || board[cursor] !== value) continue;
    const cursorRow = Math.floor(cursor / 9);
    const cursorColumn = cursor % 9;
    const sameBox = Math.floor(cursorRow / 3) === Math.floor(row / 3)
      && Math.floor(cursorColumn / 3) === Math.floor(column / 3);
    if (cursorRow === row || cursorColumn === column || sameBox) return true;
  }
  return false;
}

export function playerCount(competition: ZeroGameCompetition) {
  return Number(competition.players?.[0]?.count || 0);
}

export function getGameName(gameType: ZeroGameType) {
  return gameType === "sudoku" ? "Zero Sudoku" : "Zero Words";
}

export function secondsUntil(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

export function formatGameTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function profileName(profile?: ZeroGameProfile | null) {
  return profile?.full_name || profile?.username || "Zero builder";
}
