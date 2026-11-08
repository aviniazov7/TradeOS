// Shared reading of a trading plan. Both the list and the document use this
// so a missing field stays missing, and nothing is invented for display.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function listOf(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item != null && String(item).trim() !== '').map((item) => String(item).trim());
}

export function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function hasValue(value) {
  return value != null && value !== '';
}

export function planName(plan) {
  return textOf(plan?.name) || 'ללא שם';
}

export function planAccent(color) {
  return HEX_COLOR.test(color || '') ? color : '';
}

export function planSummaryText(plan) {
  const description = textOf(plan?.description);
  if (description) return description;
  return textOf(plan?.entryRules).split('\n').map((line) => line.trim()).find(Boolean) || '';
}

export function tradeExamplesOf(plan) {
  if (!Array.isArray(plan?.tradeExamples)) return [];
  return plan.tradeExamples.filter((example) => (
    example && (textOf(example.title) || textOf(example.description) || textOf(example.chartUrl))
  ));
}

export function filterPlans(plans, query, status) {
  const needle = textOf(query).toLowerCase();
  return plans.filter((plan) => {
    if (status === 'active' && !plan.isActive) return false;
    if (status === 'inactive' && plan.isActive) return false;
    if (!needle) return true;
    const haystack = [planName(plan), textOf(plan.description), ...listOf(plan.pairs)].join('\n').toLowerCase();
    return haystack.includes(needle);
  });
}

export function resolveSelection(plans, selectedId) {
  if (!plans.length) return null;
  return plans.find((plan) => plan.id === selectedId) || plans[0];
}
