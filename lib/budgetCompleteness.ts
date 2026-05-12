export type BudgetCompletionStatus = {
  status: 'complete' | 'partial' | 'missing';
  missingFields: string[];
  presentFields: string[];
};

export interface BudgetCompletenessInput {
  // line_items from conference_budget — may be a JSON string (as returned by Turso) or a parsed array
  lineItems: Array<{ budget?: string | number | null; actual?: string | number | null }> | string | null | undefined;
  // conference_budget.return_on_cost — expected return on cost multiplier
  returnOnCost: string | number | null | undefined;
  // conference_budget.required_pipeline_amount
  requiredPipelineAmount: number | null | undefined;
}

export function evaluateBudgetCompleteness(input: BudgetCompletenessInput): BudgetCompletionStatus {
  // line_items arrives as a JSON string from Turso — parse it if needed
  let rawItems: Array<{ budget?: string | number | null; actual?: string | number | null }>;
  if (typeof input.lineItems === 'string') {
    try { rawItems = JSON.parse(input.lineItems) || []; } catch { rawItems = []; }
  } else {
    rawItems = Array.isArray(input.lineItems) ? input.lineItems : [];
  }
  const totalBudget = rawItems.reduce((s, i) => s + (Number(i?.budget) || 0), 0);
  const totalActual = rawItems.reduce((s, i) => s + (Number(i?.actual) || 0), 0);
  const hasBudgetSpend = totalBudget > 0 || totalActual > 0;

  const hasReturnOnCost = (Number(input.returnOnCost) || 0) > 0;

  const hasRequiredPipeline = (input.requiredPipelineAmount ?? 0) > 0;

  const missingFields: string[] = [];
  const presentFields: string[] = [];

  if (hasBudgetSpend) {
    presentFields.push('Budget or actual spend');
  } else {
    missingFields.push('Budget or actual spend');
  }

  if (hasReturnOnCost) {
    presentFields.push('Expected return on cost');
  } else {
    missingFields.push('Expected return on cost');
  }

  if (hasRequiredPipeline) {
    presentFields.push('Required pipeline goal');
  } else {
    missingFields.push('Required pipeline goal');
  }

  if (missingFields.length === 0) return { status: 'complete', missingFields: [], presentFields };
  if (missingFields.length === 3) return { status: 'missing', missingFields, presentFields: [] };
  return { status: 'partial', missingFields, presentFields };
}
