export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function text(value: unknown, label: string, maximum = 200, required = true): string {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return '';
    throw new HttpError(400, `${label} is required.`);
  }
  const result = value.trim();
  if ((required && !result) || result.length > maximum) {
    throw new HttpError(400, `${label} must be ${required ? '1' : '0'}–${maximum} characters.`);
  }
  return result;
}

export function email(value: unknown): string {
  const result = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Enter a valid email address.');
  return result;
}

export function choice(value: unknown, choices: readonly string[], label: string): string {
  if (typeof value !== 'string' || !choices.includes(value)) throw new HttpError(400, `Select a valid ${label}.`);
  return value;
}

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid record ID.');
  }
  return value;
}

export function date(value: unknown, future = false): Date {
  const result = new Date(text(value, 'Date', 40));
  if (Number.isNaN(result.getTime()) || (future && result.getTime() <= Date.now())) {
    throw new HttpError(400, future ? 'Choose a future appointment.' : 'Enter a valid date.');
  }
  return result;
}

export function progress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new HttpError(400, 'Progress must be a whole number from 0 to 100.');
  }
  return value;
}

export function isAdmin(user: { roles?: string[]; appMetadata?: Record<string, unknown> }): boolean {
  const authorization = user.appMetadata?.authorization as { roles?: unknown } | undefined;
  return user.roles?.includes('admin') === true || (Array.isArray(authorization?.roles) && authorization.roles.includes('admin'));
}

export function customerBookingStatus(current: string, next: unknown): string {
  if (next !== 'cancelled' || !['requested', 'confirmed'].includes(current)) {
    throw new HttpError(403, 'Only pending or confirmed appointments can be cancelled.');
  }
  return 'cancelled';
}

export function services(): string[] {
  return ['CCTV & Security', 'Networking & Wi-Fi', 'Computer & IT Support', 'Website Development', 'Technology Installation', 'IT Training', 'Other enquiry'];
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Send JSON data.');
  const content = await request.text();
  if (content.length > 16000) throw new HttpError(413, 'The request is too large.');
  try {
    const result = JSON.parse(content);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new HttpError(400, 'Invalid request data.');
  }
}
