const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function layout(title, body, circleName) {
  return `<div style="font-family:Arial,sans-serif;font-size:20px;line-height:1.5;max-width:560px;margin:auto;padding:24px;border:3px solid #1d4ed8;border-radius:16px">
<h1 style="font-size:26px;color:#1e3a8a;margin-top:0">${esc(title)}</h1>${body}
<p style="font-size:14px;color:#475569;margin-bottom:0">CareCircle for ${esc(circleName)}. This is a reminder, not medical advice.</p></div>`;
}

function createEmailService({
  apiKey = process.env.BREVO_API_KEY,
  from = process.env.MAIL_FROM,
  fetchImpl = fetch,
} = {}) {
  async function send(to, subject, html) {
    if (!apiKey || !from || !to || to.length === 0) {
      console.log(`[email skipped] ${subject}`);
      return { skipped: true };
    }
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'CareCircle', email: from },
        to: to.map((email) => ({ email })),
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) throw new Error(`Email API responded ${res.status}`);
    return { sent: true };
  }

  const medLine = ({ med, time }) =>
    `<p><strong>${esc(med.name)}</strong> ${esc(med.dosage)} at <strong>${fmtTime(time)}</strong></p>` +
    (med.instructions ? `<p>${esc(med.instructions)}</p>` : '');

  return {
    sendDoseReminder: (circle, slot) =>
      send(
        circle.emails,
        `💊 Time soon: ${slot.med.name} at ${fmtTime(slot.time)}`,
        layout('Medicine reminder', medLine(slot), circle.name),
      ),
    sendMissedAlert: (circle, slot) =>
      send(
        circle.emails,
        `⚠️ Missed dose: ${slot.med.name} (${fmtTime(slot.time)})`,
        layout(
          'A dose has not been marked as taken',
          `${medLine(slot)}<p>Please check on them.</p>`,
          circle.name,
        ),
      ),
    sendAppointmentReminder: (circle, appt) =>
      send(
        circle.emails,
        `📅 Appointment: ${appt.title} on ${appt.date}`,
        layout(
          'Upcoming doctor appointment',
          `<p><strong>${esc(appt.title)}</strong></p><p>${esc(appt.date)} at ${fmtTime(appt.time)}</p>` +
            (appt.doctor ? `<p>Doctor: ${esc(appt.doctor)}</p>` : '') +
            (appt.location ? `<p>Where: ${esc(appt.location)}</p>` : ''),
          circle.name,
        ),
      ),
    sendSos: (circle) =>
      send(
        circle.emails,
        '🚨 SOS: help requested',
        layout(
          'SOS: the elder pressed the help button',
          '<p><strong>Please call them right now.</strong></p>',
          circle.name,
        ),
      ),
    sendWellbeingAlert: (circle, { note }) =>
      send(
        circle.emails,
        '⚠️ Not feeling well today',
        layout(
          'The elder reported not feeling well',
          `<p>${esc(note || 'No details given.')}</p><p>Please check in with them.</p>`,
          circle.name,
        ),
      ),
    sendConcern: (circle, item) =>
      send(
        circle.emails,
        '🛑 The elder raised a concern',
        layout(
          'A change needs a second look',
          `<p>${esc(item.text)}</p><p>The elder marked this as not right. Please talk to them.</p>`,
          circle.name,
        ),
      ),
  };
}

module.exports = { createEmailService, esc, fmtTime };
