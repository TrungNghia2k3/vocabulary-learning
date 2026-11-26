// Shared server-side proxy for VocabStudio Apps Script Webhook
// Supports News Studio (News Vocab + News) AND Book Studio (Book Vocab + Google Drive PDF + Bookshelf)

const ALLOWED_APPS_SCRIPT_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/;

export function getServerWebhookInfo() {
  const envUrl = (process.env.NEWS_SHEET_WEBHOOK_URL || '').trim();
  return {
    serverConfigured: ALLOWED_APPS_SCRIPT_RE.test(envUrl),
  };
}

export async function forwardToGoogleSheet(body = {}) {
  const clientUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
  const envUrl = (process.env.NEWS_SHEET_WEBHOOK_URL || '').trim();
  const targetUrl = clientUrl || envUrl;

  if (!targetUrl) {
    throw new Error(
      'Chưa cấu hình URL Google Apps Script. Hãy mở mục "Kết nối Sheet & Drive" để dán URL Web App (/exec).'
    );
  }
  if (!ALLOWED_APPS_SCRIPT_RE.test(targetUrl)) {
    throw new Error(
      'URL không hợp lệ. URL Apps Script Web App phải bắt đầu bằng https://script.google.com/macros/s/... và kết thúc bằng /exec'
    );
  }

  const secret =
    typeof body.secret === 'string' && body.secret.trim()
      ? body.secret.trim()
      : (process.env.NEWS_SHEET_WEBHOOK_SECRET || '').trim();

  const forwardPayload = {
    action: body.action || 'save_vocab',
    secret,
    targetSheet: body.targetSheet,
    entry: body.entry,
    entries: body.entries,
    url: body.url,
    title: body.title,
    source: body.source,
    category: body.category,
    publishedDate: body.publishedDate,
    imageUrl: body.imageUrl,
    fileId: body.fileId,
    offset: body.offset,
    chunkSize: body.chunkSize,
    currentPage: body.currentPage,
    totalPages: body.totalPages,
    bookmarks: body.bookmarks,
  };

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      Accept: 'application/json',
    },
    redirect: 'follow',
    body: JSON.stringify(forwardPayload),
    signal: AbortSignal.timeout(25000),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (res.status === 401 || res.status === 403 || /ServiceLogin|accounts\.google\.com/i.test(text)) {
      throw new Error(
        'Apps Script yêu cầu đăng nhập Google. Hãy kiểm tra lại bước Deploy: mục "Who has access" phải chọn "Anyone" (Bất kỳ ai).'
      );
    }
    throw new Error(`Phản hồi không hợp lệ từ Google Apps Script (HTTP ${res.status}).`);
  }

  if (!res.ok || parsed?.ok === false) {
    throw new Error(parsed?.error || `Google Apps Script trả về lỗi (HTTP ${res.status}).`);
  }

  return parsed;
}
