// Adapted from Spliit, MIT (c) 2023 Sebastien Castiel. See LICENSE.
// Source: 73478ed2f67a59e83866948caeece6bf2ecb985e, src/lib/balances.ts.
// Orgalina supplies persisted whole-peso shares; only paid expenses count.
export function getBalances(expenses) {
  const balances = {};
  const entry = id => balances[id] ||= { paid: 0, paidFor: 0, total: 0 };
  for (const expense of expenses) {
    entry(expense.paidBy).paid += expense.amount;
    for (const share of expense.shares) entry(share.userId).paidFor += share.amount;
  }
  for (const balance of Object.values(balances)) balance.total = balance.paid - balance.paidFor;
  return balances;
}
export function getSuggestedReimbursements(balances) {
  const rows = Object.entries(balances).map(([participantId, { total }]) => ({ participantId, total })).filter(b => b.total !== 0);
  rows.sort((a, b) => a.total > 0 && b.total < 0 ? -1 : b.total > 0 && a.total < 0 ? 1 : a.participantId < b.participantId ? -1 : 1);
  const reimbursements = [];
  while (rows.length > 1) {
    const first = rows[0], last = rows[rows.length - 1];
    const amount = first.total + last.total;
    if (first.total > -last.total) {
      reimbursements.push({ from: last.participantId, to: first.participantId, amount: -last.total });
      first.total = amount;
      rows.pop();
    } else {
      reimbursements.push({ from: last.participantId, to: first.participantId, amount: first.total });
      last.total = amount;
      rows.shift();
    }
  }
  return reimbursements.filter(r => r.amount !== 0);
}
