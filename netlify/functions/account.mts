import { getUser, refreshSession } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { isAdmin } from '../../server/validation.js';

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    await refreshSession();
    const user = await getUser();
    return Response.json({ user: user ? { id: user.id, name: user.name, email: user.email, admin: isAdmin(user) } : null }, { headers });
  } catch {
    return Response.json({ error: 'Account service is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
};

export const config: Config = { path: '/api/account', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
