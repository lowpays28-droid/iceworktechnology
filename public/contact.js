if (/#(?:confirmation_token|recovery_token|invite_token|access_token|email_change_token)=/.test(window.location.hash)) {
  window.location.replace('/dashboard' + window.location.hash);
}

document.getElementById('contactForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const note = document.getElementById('formNote');
  button.disabled = true;
  button.textContent = 'Sending…';
  note.textContent = 'Sending your enquiry securely…';
  try {
    const response = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Your enquiry could not be sent. Please try again.');
    note.textContent = data.message;
    form.reset();
  } catch (error) {
    note.textContent = error.message || 'Connection interrupted. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Send Enquiry ↗';
  }
});
