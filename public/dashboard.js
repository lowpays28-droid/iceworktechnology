import { login, signup, logout, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, getUser } from '@netlify/identity';

const element = (id) => document.getElementById(id);
const state = { user: null, admin: false, data: null, page: 'overview', authMode: 'login', callback: null, search: '', filter: '', form: null, busy: false };
const serviceNames = ['CCTV & Security', 'Networking & Wi-Fi', 'Computer & IT Support', 'Website Development', 'Technology Installation', 'IT Training', 'Other enquiry'];
const statuses = { projects: ['planned', 'in-progress', 'on-hold', 'completed'], enquiries: ['new', 'contacted', 'in-progress', 'closed'], bookings: ['requested', 'confirmed', 'completed', 'cancelled'] };
const pageNames = { overview: 'Overview', projects: 'Projects', enquiries: 'Enquiries', bookings: 'Appointments', clients: 'Clients', account: 'Account' };
const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const label = (value) => value.replace(/-/g, ' ').replace(/^./, (character) => character.toUpperCase());
const badge = (value) => `<span class="status ${escape(value)}">${escape(label(value))}</span>`;
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos', ...options }).format(new Date(value)) : 'Not scheduled';
const appointmentTime = (value) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' }).format(new Date(value)) + ' WAT';

async function api(path, method = 'GET', input) {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: input ? { 'Content-Type': 'application/json' } : {}, body: input ? JSON.stringify(input) : undefined });
  let result;
  try { result = await response.json(); } catch { throw new Error(response.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'The service is not available. Please try again shortly.'); }
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null;
      state.data = null;
      showAuth('login');
      element('content').replaceChildren();
    }
    throw new Error(result.error || 'Your request could not be completed.');
  }
  return result;
}

function notify(message, error = false) {
  const target = element('notice');
  target.textContent = message;
  target.classList.toggle('error', error);
  target.hidden = false;
}

function showAuth(mode = 'login') {
  state.authMode = mode;
  element('boot').hidden = true;
  element('workspace').hidden = true;
  element('auth').hidden = false;
  const reset = ['recover', 'invite'].includes(mode);
  const signupMode = mode === 'signup';
  element('authTitle').textContent = ({ login: 'Welcome back.', signup: 'Make yourself at home.', forgot: 'Let’s get you back in.', recover: 'Choose a new password.', invite: 'Welcome to ICEWORK.' })[mode];
  element('authSubtitle').textContent = ({ login: 'Sign in to keep your next step moving.', signup: 'Your projects and appointments start here.', forgot: 'We’ll send a reset link to your email.', recover: 'Use at least 10 characters to secure your account.', invite: 'Set a password to accept your invitation.' })[mode];
  element('authTabs').hidden = reset;
  element('authNameLabel').hidden = !signupMode;
  element('authEmailLabel').hidden = reset;
  element('authPasswordLabel').hidden = mode === 'forgot';
  const form = element('authForm');
  form.elements.name.required = signupMode;
  form.elements.email.required = !reset;
  form.elements.password.required = mode !== 'forgot';
  form.elements.password.minLength = signupMode || reset ? 10 : 1;
  form.elements.password.autocomplete = signupMode || reset ? 'new-password' : 'current-password';
  form.elements.password.value = '';
  element('authSubmit').textContent = ({ login: 'Sign in ↗', signup: 'Create account ↗', forgot: 'Send reset link ↗', recover: 'Save new password ↗', invite: 'Accept invitation ↗' })[mode];
  element('forgotPassword').hidden = mode !== 'login';
  element('authMessage').textContent = '';
  document.querySelectorAll('[data-auth]').forEach((button) => button.classList.toggle('active', button.dataset.auth === mode));
}

element('authTabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-auth]');
  if (button) showAuth(button.dataset.auth);
});
element('forgotPassword').addEventListener('click', () => showAuth('forgot'));
element('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  const button = element('authSubmit');
  const message = element('authMessage');
  button.disabled = true;
  message.classList.remove('error');
  message.textContent = 'Connecting securely…';
  try {
    if (state.authMode === 'forgot') {
      await requestPasswordRecovery(input.email.trim());
      message.textContent = 'If this account exists, a password reset email is on its way. Check your inbox and spam folder.';
      return;
    }
    if (state.authMode === 'signup') {
      const created = await signup(input.email.trim(), input.password, { full_name: input.name.trim() });
      if (!created.confirmedAt) {
        showAuth('login');
        message.textContent = 'Check your email to confirm your account, then sign in.';
        return;
      }
    } else if (state.authMode === 'recover') {
      await updateUser({ password: input.password });
      await login(state.callback.user.email, input.password);
      state.callback = null;
    } else if (state.authMode === 'invite') {
      const invited = await acceptInvite(state.callback.token, input.password);
      await login(invited.email, input.password);
      state.callback = null;
    } else {
      await login(input.email.trim(), input.password);
    }
    form.elements.password.value = '';
    window.location.replace('/dashboard');
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message || 'Sign-in is unavailable. Please try again.';
  } finally {
    button.disabled = false;
  }
});

async function openWorkspace() {
  const account = await api('account');
  if (!account.user) { showAuth(); return; }
  state.user = account.user;
  state.admin = account.user.admin;
  element('boot').hidden = true;
  element('auth').hidden = true;
  element('workspace').hidden = false;
  element('clientsNav').hidden = !state.admin;
  element('roleBadge').textContent = state.admin ? 'Admin' : 'Customer';
  element('sideRole').textContent = state.admin ? 'Admin workspace' : 'Customer workspace';
  element('today').textContent = formatDate(new Date());
  updateIdentity();
  await loadData();
}

function updateIdentity() {
  const name = (!state.admin && state.data?.clients[0]?.name) || state.user.name || state.user.email;
  element('sideName').textContent = name;
  element('sideAvatar').textContent = initials(name);
  element('topAvatar').textContent = initials(name);
}

async function loadData() {
  if (state.busy) return;
  state.busy = true;
  element('refresh').disabled = true;
  element('newRecord').disabled = true;
  element('content').setAttribute('aria-busy', 'true');
  try {
    state.data = await api('workspace');
    state.admin = state.data.admin;
    element('clientsNav').hidden = !state.admin;
    element('roleBadge').textContent = state.admin ? 'Admin' : 'Customer';
    element('sideRole').textContent = state.admin ? 'Admin workspace' : 'Customer workspace';
    element('projectCount').textContent = state.data.projects.filter((project) => project.status !== 'completed').length;
    element('enquiryCount').textContent = state.data.enquiries.filter((enquiry) => enquiry.status === 'new').length;
    updateIdentity();
    renderPage();
  } catch (error) {
    if (!state.data) element('content').innerHTML = empty('We couldn’t load your workspace.', 'Use Refresh to try again. Your saved records remain safe.');
    notify(error.message, true);
  } finally {
    state.busy = false;
    element('refresh').disabled = false;
    element('newRecord').disabled = !state.data;
    element('content').setAttribute('aria-busy', 'false');
  }
}

function empty(title, description, action, actionLabel = 'Get started') {
  return `<div class="empty"><div class="empty-mark" aria-hidden="true">▱</div><h3>${escape(title)}</h3><p>${escape(description)}</p>${action ? `<button class="secondary" data-action="${escape(action)}">${escape(actionLabel)} <span>↗</span></button>` : ''}</div>`;
}

function progressBar(project) {
  return `<div class="progress-line"><div class="progress-track" role="progressbar" aria-label="${escape(project.title)} progress" aria-valuenow="${project.progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${project.progress}%"></div></div><span class="progress-number">${project.progress}%</span></div>`;
}

function upcoming() {
  return state.data.bookings.filter((booking) => ['requested', 'confirmed'].includes(booking.status) && new Date(booking.appointmentAt) > new Date()).sort((first, second) => new Date(first.appointmentAt) - new Date(second.appointmentAt));
}

function overview() {
  const data = state.data;
  const activeProjects = data.projects.filter((project) => project.status !== 'completed');
  const appointments = upcoming();
  const firstName = ((!state.admin && data.clients[0]?.name) || state.user.name || 'there').split(' ')[0];
  const cards = [
    { name: 'Active projects', value: activeProjects.length, note: 'From planning to delivery', icon: '▱' },
    { name: state.admin ? 'New enquiries' : 'Open enquiries', value: data.enquiries.filter((enquiry) => state.admin ? enquiry.status === 'new' : enquiry.status !== 'closed').length, note: state.admin ? 'Ready for your next response' : 'Conversations in progress', icon: '≡' },
    { name: 'Upcoming visits', value: appointments.length, note: 'Requested & confirmed', icon: '▦' },
    { name: state.admin ? 'Clients' : 'Completed projects', value: state.admin ? data.clients.length : data.projects.filter((project) => project.status === 'completed').length, note: state.admin ? 'People you’re working with' : 'Technology put to work', icon: '◎' },
  ];
  return `<div class="hero-panel"><div><span class="eyebrow ink">${state.admin ? 'YOUR BUSINESS, CONNECTED' : 'GOOD TO HAVE YOU HERE'}</span><h2>${state.admin ? 'Every request. A clear next step.' : `Hello, ${escape(firstName)}.<br>Let’s keep things moving.`}</h2><p>${state.admin ? 'Keep track of your clients, move projects forward, and turn incoming enquiries into your next conversation.' : 'Follow your projects, request a visit, or tell us what you need. Your ICEWORK team is just a message away.'}</p><button class="hero-link" data-action="${state.admin ? 'clients' : 'new-booking'}">${state.admin ? 'See your client directory' : 'Plan a service appointment'} ↗</button></div><div class="hero-graphic" aria-hidden="true"><div class="graphic-ring"><div class="graphic-chip">IW</div></div><span class="graphic-note">Connected. Supported. Moving.</span></div></div>
    <div class="stats">${cards.map((card) => `<article class="stat"><div class="stat-top">${card.name}<span class="stat-icon" aria-hidden="true">${card.icon}</span></div><div class="stat-value">${card.value}</div><div class="stat-caption">${card.note}</div></article>`).join('')}</div>
    <div class="overview-grid"><section class="panel"><div class="panel-head"><div><h2>Projects in motion</h2><p>A little progress, a big difference.</p></div><button data-action="projects">View all ↗</button></div>${activeProjects.length ? `<div class="panel-body">${activeProjects.slice(0, 4).map((project) => `<article class="project-row"><div class="project-row-top"><h3>${escape(project.title)}</h3>${badge(project.status)}</div><p>${escape(state.admin ? project.clientName + ' · ' : '')}${escape(project.service)}</p>${progressBar(project)}</article>`).join('')}</div>` : empty('A fresh start for your next project.', state.admin ? 'Add a client, then create a project to track its progress.' : 'Once the team starts your project, you’ll see its progress here.', state.admin ? 'new-project' : 'new-enquiry', state.admin ? 'Create project' : 'Tell us what you need')}</section>
    <section class="panel"><div class="panel-head"><div><h2>Next on the calendar</h2><p>Appointments in West Africa Time.</p></div><button data-action="bookings">View all ↗</button></div>${appointments.length ? `<div class="panel-body">${appointments.slice(0, 3).map((booking) => `<article class="appointment"><div class="date-tile"><small>${escape(formatDate(booking.appointmentAt, { day: undefined, year: undefined }))}</small><strong>${escape(formatDate(booking.appointmentAt, { month: undefined, year: undefined }))}</strong></div><div><h3>${escape(booking.service)}</h3><p>${escape(appointmentTime(booking.appointmentAt))}${state.admin ? ' · ' + escape(booking.clientName) : ''}</p>${badge(booking.status)}</div></article>`).join('')}</div>` : empty('Some room in your calendar.', 'Request a service appointment. Our team will confirm the time with you.', 'new-booking', 'Book a visit')}</section></div>
    <div class="support-strip"><div><strong>Real people. Practical support.</strong><p>Have a question about your project or need a hand with something?</p></div><a href="https://wa.me/2349013190193" target="_blank" rel="noopener">Talk to the team ↗</a></div>`;
}

function renderPage() {
  if (!state.data) return;
  if (state.page === 'clients' && !state.admin) state.page = 'overview';
  const title = pageNames[state.page];
  const descriptions = { overview: 'Your projects and next steps, all in one place.', projects: 'From the first plan to the finishing touches.', enquiries: state.admin ? 'Turn incoming requests into useful conversations.' : 'Your conversations with the ICEWORK team.', bookings: 'Plan your visits. Keep your next step on the calendar.', clients: 'The people behind every project.', account: 'Your contact details and workspace access.' };
  element('pageTitle').textContent = title;
  element('breadcrumb').textContent = title;
  element('pageDescription').textContent = descriptions[state.page];
  element('pageKicker').textContent = state.page === 'overview' ? 'THE BIG PICTURE' : 'YOUR WORKSPACE';
  const actions = { overview: state.admin ? 'New project' : 'New enquiry', projects: state.admin ? 'New project' : 'New enquiry', enquiries: 'New enquiry', bookings: 'Book appointment', clients: 'Add client' };
  element('newRecord').hidden = state.page === 'account';
  element('newRecord').innerHTML = `${actions[state.page] || 'New enquiry'} <span>+</span>`;
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page));
  if (state.page === 'overview') element('content').innerHTML = overview();
  else if (state.page === 'account') element('content').innerHTML = accountView();
  else {
    const options = statuses[state.page] || [];
    element('content').innerHTML = `<section class="panel"><div class="list-toolbar"><input id="recordSearch" type="search" aria-label="Search ${title.toLowerCase()}" placeholder="Search ${title.toLowerCase()}…" value="${escape(state.search)}">${options.length ? `<select id="statusFilter" aria-label="Filter by status"><option value="">All statuses</option>${options.map((status) => `<option value="${status}" ${state.filter === status ? 'selected' : ''}>${escape(label(status))}</option>`).join('')}</select>` : `<span class="muted">${state.data.clients.length} clients</span>`}</div><div id="records"></div></section>`;
    renderRecords();
  }
}

function renderRecords() {
  const rows = state.data[state.page].filter((record) => (!state.filter || record.status === state.filter) && [record.title, record.name, record.email, record.service, record.clientName, record.message, record.location].some((value) => value?.toLowerCase().includes(state.search.toLowerCase())));
  if (!rows.length) {
    const kind = ({ projects: 'project', enquiries: 'enquiry', bookings: 'booking', clients: 'client' })[state.page];
    element('records').innerHTML = state.search || state.filter ? empty('No matching records.', 'Try another search or choose a different status.') : empty(`No ${pageNames[state.page].toLowerCase()} yet.`, ({ projects: state.admin ? 'Add a client, then create your first project.' : 'Projects assigned to your account appear here.', enquiries: 'Start a conversation about your technology needs.', bookings: 'Request a visit and the team will confirm availability.', clients: 'Add a client to start managing their projects and appointments.' })[state.page], state.page === 'projects' && !state.admin ? 'new-enquiry' : 'new-' + kind, state.page === 'clients' ? 'Add client' : state.page === 'bookings' ? 'Request appointment' : 'Get started');
    return;
  }
  if (state.page === 'projects') {
    element('records').innerHTML = `<div class="project-cards panel-body">${rows.map((project) => `<article class="project-card"><div class="project-row-top"><span class="service-label">${escape(project.service)}</span>${badge(project.status)}</div><h3>${escape(project.title)}</h3>${state.admin ? `<p class="service-label">${escape(project.clientName)}</p>` : ''}<p class="description">${escape(project.description || 'The team will add project details as work progresses.')}</p>${progressBar(project)}<div class="card-footer"><span>Due: ${escape(formatDate(project.dueDate))}</span>${state.admin ? `<button class="row-action" data-action="edit-project" data-id="${project.id}">Edit ↗</button>` : '<span>Updated by ICEWORK</span>'}</div></article>`).join('')}</div>`;
  } else if (state.page === 'clients') {
    element('records').innerHTML = table(['Client', 'Phone', 'Projects', 'Access', ''], rows.map((client) => `<tr><td><strong>${escape(client.name)}</strong><small>${escape(client.email)}</small></td><td>${escape(client.phone || 'Not provided')}</td><td>${state.data.projects.filter((project) => project.clientId === client.id).length}</td><td>${client.userId ? 'Customer account' : 'Not registered'}</td><td><button class="row-action" data-action="edit-client" data-id="${client.id}">Edit ↗</button></td></tr>`));
  } else if (state.page === 'enquiries') {
    element('records').innerHTML = table(['Service / request', ...(state.admin ? ['Customer'] : []), 'Received', 'Status', ''], rows.map((enquiry) => `<tr><td><strong>${escape(enquiry.service)}</strong><small>${escape(enquiry.message.slice(0, 65))}${enquiry.message.length > 65 ? '…' : ''}</small></td>${state.admin ? `<td><strong>${escape(enquiry.name)}</strong><small>${escape(enquiry.email)}</small></td>` : ''}<td>${escape(formatDate(enquiry.createdAt))}</td><td>${badge(enquiry.status)}</td><td><button class="row-action" data-action="view-enquiry" data-id="${enquiry.id}">View ↗</button></td></tr>`));
  } else {
    element('records').innerHTML = table(['Service', ...(state.admin ? ['Client'] : []), 'Appointment', 'Status', ''], rows.map((booking) => `<tr><td><strong>${escape(booking.service)}</strong><small>${escape(booking.location)}</small></td>${state.admin ? `<td>${escape(booking.clientName)}</td>` : ''}<td><strong>${escape(formatDate(booking.appointmentAt))}</strong><small>${escape(appointmentTime(booking.appointmentAt))}</small></td><td>${badge(booking.status)}</td><td><button class="row-action" data-action="view-booking" data-id="${booking.id}">View ↗</button></td></tr>`));
  }
}

function table(headings, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headings.map((heading) => `<th scope="col">${escape(heading)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function accountView() {
  const client = state.data.clients[0];
  return `<div class="account-layout"><section class="panel"><div class="panel-head"><div><h2>Your contact details</h2><p>Keep the team in the loop.</p></div></div><div class="panel-body"><form id="profileForm"><label>Full name<input name="name" required maxlength="120" value="${escape(!state.admin && client ? client.name : state.user.name || '')}" ${state.admin ? 'disabled' : ''}></label><label>Email address<input type="email" value="${escape(state.user.email)}" disabled></label><p class="hint">Your verified email links your requests and projects to your account.</p>${!state.admin ? `<label>Phone number<input name="phone" maxlength="40" value="${escape(client?.phone || '')}"></label><button class="primary" type="submit">Save contact details ↗</button>` : '<p class="account-description">Admin accounts are managed through Netlify Identity by the site owner.</p>'}</form></div></section><section class="panel"><div class="panel-head"><h2>Access & security</h2></div><div class="panel-body"><div class="account-role"><strong>${state.admin ? 'Administrator workspace' : 'Customer workspace'}</strong><p>${state.admin ? 'Manage incoming enquiries, clients, projects, and service appointments.' : 'Only your own enquiries, projects, appointments, and contact details are visible to you.'}</p></div><p class="account-description">Need to update your password? Send a secure reset link to <strong>${escape(state.user.email)}</strong>.</p><button class="secondary" style="margin-top:18px" data-action="reset-password">Send password reset email</button></div></section></div>`;
}

function navigate(page) {
  if (!pageNames[page]) return;
  state.page = page;
  state.search = '';
  state.filter = '';
  element('notice').hidden = true;
  element('sidebar').classList.remove('open');
  element('mobileMenu').setAttribute('aria-expanded', 'false');
  renderPage();
  element('main').focus({ preventScroll: true });
}

function input(name, title, value = '', type = 'text', required = true, extra = '') {
  return `<label>${escape(title)}<input name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${extra}></label>`;
}

function select(name, title, values, selected) {
  return `<label>${escape(title)}<select name="${name}" required>${values.map((item) => { const value = typeof item === 'string' ? item : item.id; const title = typeof item === 'string' ? label(item) : item.name; return `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(title)}</option>`; }).join('')}</select></label>`;
}

function textarea(name, title, value = '', required = false, max = 5000) {
  return `<label>${escape(title)}<textarea name="${name}" maxlength="${max}" ${required ? 'required' : ''}>${escape(value)}</textarea></label>`;
}

function detail(items) {
  return `<dl class="record-detail">${items.map(([title, value]) => `<dt>${escape(title)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>`;
}

function openForm(kind, recordId) {
  if (!state.data) return;
  const key = ({ project: 'projects', client: 'clients', enquiry: 'enquiries', booking: 'bookings' })[kind];
  const record = recordId ? state.data[key].find((item) => item.id === recordId) : null;
  if (recordId && !record) return;
  if (['project', 'client'].includes(kind) && !state.admin) return;
  if (['project', 'booking'].includes(kind) && state.admin && !record && !state.data.clients.length) {
    notify('Add a client first, then create their project or appointment.');
    navigate('clients');
    openForm('client');
    return;
  }
  state.form = { kind, record, readonly: false };
  const titles = { project: record ? 'Update project' : 'Start a project', client: record ? 'Update client' : 'Add a client', enquiry: record ? 'Enquiry details' : 'Tell us what you need', booking: record ? 'Appointment details' : 'Plan a service appointment' };
  element('dialogTitle').textContent = titles[kind];
  element('dialogMessage').textContent = '';
  element('dialogMessage').classList.remove('error');
  element('saveRecord').hidden = false;
  element('saveRecord').textContent = 'Save';
  let fields = '';
  if (kind === 'project') {
    fields = (record ? detail([['Client', record.clientName]]) : select('clientId', 'Client', state.data.clients)) + input('title', 'Project title', record?.title, 'text', true, 'maxlength="180"') + select('service', 'Service', serviceNames, record?.service) + textarea('description', 'Project details', record?.description) + `<div class="field-row">${select('status', 'Status', statuses.projects, record?.status || 'planned')}${input('progress', 'Progress (%)', record?.progress || 0, 'number', true, 'min="0" max="100" step="1"')}</div>` + input('dueDate', 'Target completion date', record?.dueDate?.slice(0, 10), 'date', false);
  } else if (kind === 'client') {
    fields = input('name', 'Client name', record?.name, 'text', true, 'maxlength="120"') + (record ? detail([['Verified account email', record.email]]) : input('email', 'Email address', '', 'email', true, 'maxlength="254"') + '<p class="hint">Use the customer’s own email. Their confirmed account automatically connects to this client record.</p>') + input('phone', 'Phone number', record?.phone, 'tel', false, 'maxlength="40"');
  } else if (kind === 'enquiry' && !record) {
    const profile = !state.admin ? state.data.clients[0] : null;
    fields = `<div class="field-row">${input('name', 'Your name', profile?.name || state.user.name, 'text', true, 'maxlength="120"')}${input('phone', 'Phone number', profile?.phone, 'tel', true, 'maxlength="40"')}</div>` + detail([['Reply email', state.user.email]]) + select('service', 'What do you need help with?', serviceNames) + textarea('message', 'Project details', '', true);
    element('saveRecord').textContent = 'Send enquiry ↗';
  } else if (kind === 'enquiry') {
    fields = detail([['Service', record.service], ['Customer', record.name], ['Email', record.email], ['Phone', record.phone], ['Received', formatDate(record.createdAt)], ['Project details', record.message]]) + (state.admin ? select('status', 'Status', statuses.enquiries, record.status) : detail([['Status', label(record.status)]]));
    state.form.readonly = !state.admin;
  } else if (kind === 'booking' && !record) {
    const minimum = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    fields = (state.admin ? select('clientId', 'Client', state.data.clients) : '') + select('service', 'Service', serviceNames) + input('appointmentAt', 'Preferred date & time', '', 'datetime-local', true, `min="${minimum}"`) + '<p class="hint">West Africa Time (WAT, UTC+1). This is a request, not a confirmed appointment. The team will confirm availability.</p>' + input('location', 'Address or meeting location', '', 'text', true, 'maxlength="300"') + textarea('notes', 'Anything we should know?', '', false, 2000);
    element('saveRecord').textContent = 'Request appointment ↗';
  } else if (kind === 'booking') {
    fields = detail([['Service', record.service], ['Client', record.clientName], ['Appointment', formatDate(record.appointmentAt) + ' · ' + appointmentTime(record.appointmentAt)], ['Location', record.location], ['Notes', record.notes || 'No additional notes.']]);
    if (state.admin) fields += select('status', 'Status', statuses.bookings, record.status);
    else if (['requested', 'confirmed'].includes(record.status)) {
      fields += detail([['Status', label(record.status)]]) + '<p class="hint">Cancelling releases this appointment request. You can request a new appointment at any time.</p>';
      element('saveRecord').textContent = 'Cancel appointment';
    } else {
      fields += detail([['Status', label(record.status)]]);
      state.form.readonly = true;
    }
  }
  element('dialogFields').innerHTML = fields;
  element('saveRecord').hidden = state.form.readonly;
  element('recordDialog').showModal();
}

element('recordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.form.readonly) return;
  const { kind, record } = state.form;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  if (record) values.id = record.id;
  if (kind === 'project') values.progress = Number(values.progress);
  if (kind === 'booking' && !record) values.appointmentAt = new Date(values.appointmentAt + ':00+01:00').toISOString();
  if (kind === 'booking' && record && !state.admin) values.status = 'cancelled';
  if (kind === 'enquiry' && !record) values.email = state.user.email;
  const target = ({ project: 'projects', client: 'clients', enquiry: 'enquiries', booking: 'bookings' })[kind];
  const button = element('saveRecord');
  const message = element('dialogMessage');
  button.disabled = true;
  element('cancelDialog').disabled = true;
  element('closeDialog').disabled = true;
  message.classList.remove('error');
  message.textContent = 'Saving your details…';
  try {
    const result = await api(target, record ? 'PATCH' : 'POST', values);
    element('recordDialog').close();
    notify(result.message);
    await loadData();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  } finally {
    button.disabled = false;
    element('cancelDialog').disabled = false;
    element('closeDialog').disabled = false;
  }
});

element('recordDialog').addEventListener('cancel', (event) => { if (element('saveRecord').disabled) event.preventDefault(); });
element('closeDialog').addEventListener('click', () => element('recordDialog').close());
element('cancelDialog').addEventListener('click', () => element('recordDialog').close());
element('workspaceNav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (button) navigate(button.dataset.page);
});
element('mobileMenu').addEventListener('click', () => {
  const open = element('sidebar').classList.toggle('open');
  element('mobileMenu').setAttribute('aria-expanded', String(open));
});
element('refresh').addEventListener('click', () => { element('notice').hidden = true; loadData(); });
element('newRecord').addEventListener('click', () => {
  const kind = ({ overview: state.admin ? 'project' : 'enquiry', projects: state.admin ? 'project' : 'enquiry', enquiries: 'enquiry', bookings: 'booking', clients: 'client' })[state.page];
  if (kind) openForm(kind);
});
element('content').addEventListener('input', (event) => {
  if (event.target.id === 'recordSearch') { state.search = event.target.value; renderRecords(); }
});
element('content').addEventListener('change', (event) => {
  if (event.target.id === 'statusFilter') { state.filter = event.target.value; renderRecords(); }
});
element('content').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (pageNames[action]) { navigate(action); return; }
  if (action === 'reset-password') {
    button.disabled = true;
    try { await requestPasswordRecovery(state.user.email); notify('A password reset link is on its way. Check your inbox.'); } catch { notify('The reset email could not be sent. Please try again.', true); } finally { button.disabled = false; }
    return;
  }
  const kind = action.split('-').pop();
  if (['project', 'client', 'enquiry', 'booking'].includes(kind)) openForm(kind, button.dataset.id);
});
element('content').addEventListener('submit', async (event) => {
  if (event.target.id !== 'profileForm') return;
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  try { const result = await api('profile', 'PATCH', Object.fromEntries(new FormData(event.target))); notify(result.message); await loadData(); } catch (error) { notify(error.message, true); } finally { button.disabled = false; }
});
element('logout').addEventListener('click', async () => {
  element('logout').disabled = true;
  try {
    await logout();
    window.location.replace('/dashboard');
  } catch {
    notify('Sign-out could not be completed. Please try again.', true);
    element('logout').disabled = false;
  }
});

async function start() {
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite') {
      state.callback = callback;
      showAuth('invite');
      return;
    }
    if (callback?.type === 'recovery') {
      state.callback = callback;
      showAuth('recover');
      return;
    }
    await getUser();
    await openWorkspace();
  } catch (error) {
    window.history.replaceState(null, '', '/dashboard');
    showAuth('login');
    element('authMessage').classList.add('error');
    element('authMessage').textContent = error.message || 'Account access is temporarily unavailable. Please try again.';
  }
}

start();
