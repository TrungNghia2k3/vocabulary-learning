import { forwardToGoogleSheet, getServerWebhookInfo } from '../../api/_saveVocabCore.mjs';

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify(getServerWebhookInfo()) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const result = await forwardToGoogleSheet(body);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Không gửi được dữ liệu lên Google Sheets.',
      }),
    };
  }
}
