// Adapted from Spliit, MIT (c) 2023 Sebastien Castiel. See LICENSE.
// Source: 73478ed2f67a59e83866948caeece6bf2ecb985e, src/lib/shares.ts.
// Removed TypeScript/Prisma/ts-pattern; monetary minor unit is one Chilean peso.
function hashString(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
function apportion(amount, shares, totalShares, offset) {
  const count = shares.length;
  if (!count) return [];
  if (totalShares === 0) return shares.map(() => 0);
  const amounts = [], remainders = [];
  let distributed = 0;
  shares.forEach((share, index) => {
    const exact = amount * share;
    const base = Math.floor(exact / totalShares);
    amounts.push(base);
    distributed += base;
    remainders.push({ index, remainder: exact - base * totalShares });
  });
  const remaining = amount - distributed;
  if (remaining === 0) return amounts;
  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return b.remainder - a.remainder;
    const rotate = index => (index - offset + count) % count;
    return rotate(a.index) - rotate(b.index);
  });
  for (let i = 0; i < remaining; i++) amounts[remainders[i].index] += 1;
  return amounts;
}
export function getExpenseShares(expense) {
  const paidFors = [...expense.paidFor].sort((a, b) => a.participantId < b.participantId ? -1 : 1);
  const shares = expense.splitMode === 'EVENLY' ? paidFors.map(() => 1) : paidFors.map(p => p.shares);
  const total = shares.reduce((sum, s) => sum + s, 0);
  const offset = expense.id && paidFors.length ? hashString(expense.id) % paidFors.length : 0;
  const amounts = apportion(expense.amount, shares, total, offset);
  return new Map(paidFors.map((p, i) => [p.participantId, amounts[i]]));
}
