-- 出欠回答を保存する表（rsvps）を作成する
CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  attendance TEXT NOT NULL CHECK (attendance IN ('参加', '不参加', '未定')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
