import { getUser, refreshSession, verifyRequestOrigin, AuthError } from '@netlify/identity';
import type { Config } from '@netlify/functions';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { clients, enquiries, projects, bookings } from '../../db/schema.js';
import { HttpError, body, text, email, choice, identifier, date, progress, isAdmin, customerBookingStatus, services } from '../../server/validation.js';

export default async (request: Request) => {
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const resource = new URL(request.url).pathname.split('/').pop();
    if (!['GET', 'POST', 'PATCH'].includes(request.method)) return respond({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET') verifyRequestOrigin(request);
    const input = request.method === 'GET' ? {} : await body(request);
    await refreshSession();
    const user = await getUser();
    const db = database();
    if (resource === 'enquiries' && request.method === 'POST') {
      if (input.website) return respond({ message: 'Enquiry received.' }, 201);
      const values = {
        userId: user?.id ?? null,
        name: text(input.name, 'Name', 120),
        email: user?.email ? email(user.email) : email(input.email),
        phone: text(input.phone, 'Phone number', 40),
        service: choice(input.service, services(), 'service'),
        message: text(input.message, 'Project details', 5000),
      };
      await db.insert(enquiries).values(values);
      return respond({ message: 'Your enquiry has been received. Our team will follow up with you.' }, 201);
    }
    if (!user || !user.email || !user.confirmedAt) throw new HttpError(401, 'Please sign in with a confirmed email address.');
    const admin = isAdmin(user);
    const clientEmail = email(user.email);
    let [client] = await db.select().from(clients).where(eq(clients.userId, user.id));
    if (!admin && !client) {
      [client] = await db.insert(clients).values({ userId: user.id, email: clientEmail, name: user.name || clientEmail }).onConflictDoUpdate({
        target: clients.email,
        set: { userId: user.id },
      }).returning();
    }
    if (!admin) {
      await db.update(enquiries).set({ userId: user.id }).where(and(eq(enquiries.email, clientEmail), isNull(enquiries.userId)));
    }
    if (resource === 'workspace' && request.method === 'GET') {
      const [clientRows, enquiryRows, projectRows, bookingRows] = await Promise.all([
        db.select().from(clients).where(admin ? undefined : eq(clients.userId, user.id)).orderBy(desc(clients.createdAt)),
        db.select().from(enquiries).where(admin ? undefined : eq(enquiries.userId, user.id)).orderBy(desc(enquiries.createdAt)),
        db.select({ id: projects.id, clientId: projects.clientId, title: projects.title, service: projects.service, description: projects.description, status: projects.status, progress: projects.progress, dueDate: projects.dueDate, createdAt: projects.createdAt, clientName: clients.name }).from(projects).innerJoin(clients, eq(projects.clientId, clients.id)).where(admin ? undefined : eq(clients.userId, user.id)).orderBy(desc(projects.createdAt)),
        db.select({ id: bookings.id, clientId: bookings.clientId, service: bookings.service, appointmentAt: bookings.appointmentAt, location: bookings.location, notes: bookings.notes, status: bookings.status, createdAt: bookings.createdAt, clientName: clients.name }).from(bookings).innerJoin(clients, eq(bookings.clientId, clients.id)).where(admin ? undefined : eq(clients.userId, user.id)).orderBy(desc(bookings.createdAt)),
      ]);
      return respond({ admin, clients: clientRows, enquiries: enquiryRows, projects: projectRows, bookings: bookingRows });
    }
    if (resource === 'bookings' && request.method === 'POST') {
      const clientId = admin ? identifier(input.clientId) : client.id;
      const [owner] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
      if (!owner) throw new HttpError(404, 'Client not found.');
      await db.insert(bookings).values({ clientId, service: choice(input.service, services(), 'service'), appointmentAt: date(input.appointmentAt, true), location: text(input.location, 'Location', 300), notes: text(input.notes, 'Notes', 2000, false) });
      return respond({ message: 'Appointment requested. The team will confirm availability.' }, 201);
    }
    if (resource === 'bookings' && request.method === 'PATCH') {
      const recordId = identifier(input.id);
      const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, recordId), admin ? undefined : eq(bookings.clientId, client.id)));
      if (!booking) throw new HttpError(404, 'Appointment not found.');
      const status = admin ? choice(input.status, ['requested', 'confirmed', 'completed', 'cancelled'], 'status') : customerBookingStatus(booking.status, input.status);
      const [updated] = await db.update(bookings).set({ status }).where(and(eq(bookings.id, recordId), eq(bookings.status, booking.status))).returning({ id: bookings.id });
      if (!updated) throw new HttpError(409, 'The appointment changed. Refresh and try again.');
      return respond({ message: 'Appointment updated.' });
    }
    if (resource === 'profile' && request.method === 'PATCH' && !admin) {
      await db.update(clients).set({ name: text(input.name, 'Name', 120), phone: text(input.phone, 'Phone', 40, false) }).where(eq(clients.id, client.id));
      return respond({ message: 'Contact details saved.' });
    }
    if (!admin) throw new HttpError(403, 'Administrator access is required.');
    if (resource === 'clients' && request.method === 'POST') {
      await db.insert(clients).values({ name: text(input.name, 'Name', 120), email: email(input.email), phone: text(input.phone, 'Phone', 40, false) });
      return respond({ message: 'Client added.' }, 201);
    }
    if (resource === 'clients' && request.method === 'PATCH') {
      const [updated] = await db.update(clients).set({ name: text(input.name, 'Name', 120), phone: text(input.phone, 'Phone', 40, false) }).where(eq(clients.id, identifier(input.id))).returning({ id: clients.id });
      if (!updated) throw new HttpError(404, 'Client not found.');
      return respond({ message: 'Client updated.' });
    }
    if (resource === 'projects' && ['POST', 'PATCH'].includes(request.method)) {
      const values = { title: text(input.title, 'Project title', 180), service: choice(input.service, services(), 'service'), description: text(input.description, 'Description', 5000, false), status: choice(input.status, ['planned', 'in-progress', 'on-hold', 'completed'], 'status'), progress: progress(input.progress), dueDate: input.dueDate ? date(input.dueDate) : null };
      if (values.status === 'completed') values.progress = 100;
      if (request.method === 'POST') {
        const clientId = identifier(input.clientId);
        const [owner] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId));
        if (!owner) throw new HttpError(404, 'Client not found.');
        await db.insert(projects).values({ ...values, clientId });
      } else {
        const [updated] = await db.update(projects).set(values).where(eq(projects.id, identifier(input.id))).returning({ id: projects.id });
        if (!updated) throw new HttpError(404, 'Project not found.');
      }
      return respond({ message: 'Project saved.' }, request.method === 'POST' ? 201 : 200);
    }
    if (resource === 'enquiries' && request.method === 'PATCH') {
      const [updated] = await db.update(enquiries).set({ status: choice(input.status, ['new', 'contacted', 'in-progress', 'closed'], 'status') }).where(eq(enquiries.id, identifier(input.id))).returning({ id: enquiries.id });
      if (!updated) throw new HttpError(404, 'Enquiry not found.');
      return respond({ message: 'Enquiry updated.' });
    }
    return respond({ error: 'Endpoint not found.' }, 404);
  } catch (error) {
    if (error instanceof HttpError || error instanceof AuthError) return respond({ error: error.message }, error.status || 400);
    const databaseCode = (error as { cause?: { code?: string }; code?: string }).cause?.code || (error as { code?: string }).code;
    if (databaseCode === '23505') return respond({ error: 'A client with this email already exists.' }, 409);
    return respond({ error: 'Your request could not be completed. Please try again shortly.' }, 503);
  }
};

export const config: Config = { path: ['/api/workspace', '/api/enquiries', '/api/clients', '/api/projects', '/api/bookings', '/api/profile'], rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
