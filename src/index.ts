import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
};

type Attendance = '参加' | '不参加' | '未定';

interface RsvpRow {
  id: number;
  name: string;
  attendance: Attendance;
  note: string | null;
  created_at: string;
}

const app = new Hono<{ Bindings: Bindings }>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatJst(sqliteUtcDatetime: string): string {
  // D1/SQLite の datetime('now') は "YYYY-MM-DD HH:MM:SS" 形式の UTC 時刻を返す
  const utcDate = new Date(sqliteUtcDatetime.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(utcDate);
}

function renderFormPage(options: { showSuccess: boolean } = { showSuccess: false }): string {
  const successBanner = options.showSuccess
    ? '<p class="success">出欠を受け付けました。ありがとうございます。</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BBH会の出欠確認</title>
<style>
  body { font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.3rem; }
  label { display: block; margin-top: 16px; font-weight: bold; }
  input[type="text"], textarea { width: 100%; padding: 8px; font-size: 1rem; box-sizing: border-box; margin-top: 4px; }
  .radio-group { display: flex; gap: 8px; margin-top: 4px; }
  .radio-option {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 10px 4px;
    border: 2px solid #ccc;
    border-radius: 8px;
    font-weight: normal;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
  }
  .radio-option input[type="radio"] { width: 18px; height: 18px; }
  .radio-option:has(input:checked) { border-color: #1e7e34; background: #e6f4ea; font-weight: bold; }
  button { margin-top: 24px; padding: 10px 24px; font-size: 1rem; cursor: pointer; }
  .success { background: #e6f4ea; color: #1e7e34; padding: 12px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>BBH会の出欠確認</h1>
  ${successBanner}
  <form method="POST" action="/rsvps">
    <label for="name">お名前</label>
    <input type="text" id="name" name="name" required maxlength="100">

    <label>出欠</label>
    <div class="radio-group">
      <label class="radio-option"><input type="radio" name="attendance" value="参加" required> 参加</label>
      <label class="radio-option"><input type="radio" name="attendance" value="不参加"> 不参加</label>
      <label class="radio-option"><input type="radio" name="attendance" value="未定"> 未定</label>
    </div>

    <label for="note">ひとこと（任意）</label>
    <input type="text" id="note" name="note" maxlength="200">

    <button type="submit">送信する</button>
  </form>
</body>
</html>`;
}

function renderAdminPage(rows: RsvpRow[]): string {
  const counts = { 参加: 0, 不参加: 0, 未定: 0 };
  for (const row of rows) {
    counts[row.attendance] += 1;
  }

  const tableRows = rows
    .map(
      (row) => `<tr>
        <td>${formatJst(row.created_at)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.attendance)}</td>
        <td>${row.note ? escapeHtml(row.note) : ''}</td>
      </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理画面 - BBH会の出欠確認</title>
<style>
  body { font-family: sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.3rem; }
  .summary { margin: 16px 0; padding: 12px; background: #f5f5f5; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; font-size: 0.95rem; }
  th { background: #fafafa; }
</style>
</head>
<body>
  <h1>管理画面：BBH会の出欠確認</h1>
  <div class="summary">
    参加 ${counts.参加}人 ／ 不参加 ${counts.不参加}人 ／ 未定 ${counts.未定}人（回答総数 ${rows.length}件）
  </div>
  <table>
    <thead>
      <tr><th>回答日時</th><th>名前</th><th>出欠</th><th>ひとこと</th></tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</body>
</html>`;
}

app.get('/', (c) => {
  const showSuccess = c.req.query('ok') === '1';
  return c.html(renderFormPage({ showSuccess }));
});

app.post('/rsvps', async (c) => {
  const body = await c.req.parseBody();
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const attendance = typeof body.attendance === 'string' ? body.attendance : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';

  const validAttendance: Attendance[] = ['参加', '不参加', '未定'];
  if (!name || !validAttendance.includes(attendance as Attendance)) {
    return c.text('入力内容を確認してください。', 400);
  }

  await c.env.DB.prepare('INSERT INTO rsvps (name, attendance, note) VALUES (?, ?, ?)')
    .bind(name, attendance, note || null)
    .run();

  return c.redirect('/?ok=1');
});

app.get('/admin', async (c) => {
  const auth = c.req.header('Authorization');
  const expected = c.env.ADMIN_PASSWORD;

  let authorized = false;
  if (auth && auth.startsWith('Basic ') && expected) {
    const decoded = atob(auth.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    authorized = password === expected;
  }

  if (!authorized) {
    return c.text('認証が必要です。', 401, {
      'WWW-Authenticate': 'Basic realm="admin"',
    });
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, attendance, note, created_at FROM rsvps ORDER BY created_at DESC'
  ).all<RsvpRow>();

  return c.html(renderAdminPage(results));
});

export default app;
