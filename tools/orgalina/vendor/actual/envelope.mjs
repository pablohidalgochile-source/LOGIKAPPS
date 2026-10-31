// Adapted from Actual Budget, MIT, Copyright James Long. See LICENSE.txt.
// Source: 9e80790d6813de89304dad3a7452d7ee31dea816, budget/envelope.ts.
// Extracts createCategory/createSummary arithmetic from the spreadsheet engine.
// Orgalina uses integer CLP, negative signed spending, no HyperFormula or CRDT.
export function categoryBalance(budgeted, spent, previous = 0, carryDebt = false) {
  return budgeted + spent + (carryDebt ? previous : Math.max(0, previous));
}
export function availableToBudget(income, previousUnassigned, previousCategories, allocated, reserved = 0) {
  const overspent = previousCategories.reduce((sum, category) =>
    category.carryDebt ? sum : sum + Math.min(0, category.balance), 0);
  return income + previousUnassigned + overspent - allocated - reserved;
}
