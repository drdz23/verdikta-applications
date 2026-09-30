// Weight-only UI feedback; full rubric validation remains server-authoritative.
export function rubricWeights(criteria = []) {
  const totalWeight = criteria.filter(c => !c.must).reduce((sum, c) => sum + c.weight, 0);
  const valid = criteria.every(c => typeof c.weight === 'number' && Number.isFinite(c.weight) &&
    c.weight >= 0 && c.weight <= 1 && (!c.must || c.weight === 0)) &&
    (totalWeight === 0 || Math.abs(totalWeight - 1) <= 0.001);
  return { valid, totalWeight, message: valid ? 'Valid' : 'Must-pass weights must be 0; scored weights must sum to 1 (tolerance 0.001), or all be 0.' };
}
