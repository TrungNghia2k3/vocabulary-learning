import { forwardToGoogleSheet, getServerWebhookInfo } from './_saveVocabCore.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json(getServerWebhookInfo());
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const result = await forwardToGoogleSheet(body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Không gửi được dữ liệu lên Google Sheets.',
    });
  }
}
