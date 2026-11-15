const { istParts, DAY_MS } = require('./scheduleUtils');

/** Append an event to the circle's shared care feed. */
function logActivity(repo, user, type, text, extra = {}) {
  return repo.addItem(user.circleId, 'activity', {
    type,
    text,
    actor: user.role,
    at: new Date().toISOString(),
    date: istParts().date,
    ...extra,
  });
}

async function recentActivity(repo, circleId, limit = 30) {
  const since = istParts(new Date(Date.now() - 14 * DAY_MS)).date; // bounded query
  const items = await repo.listItems(circleId, 'activity', { sinceDate: since });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

module.exports = { logActivity, recentActivity };
