// Deterministic Spoilage Risk & SDG 12.3 Impact Calculator
// Strictly estimates spoilage risk from dates and rules; never certifies food safety.

export type DateType = 'best_before' | 'use_by';
export type RiskLevel = 'high' | 'medium' | 'low';

export interface SpoilageEvaluation {
  daysLeft: number;
  riskLevel: RiskLevel;
  suggestedAction: string;
  safetyNotice?: string;
}

export function evaluateSpoilageRisk(
  expiryDateStr: string,
  dateType: DateType,
  category: string,
  nowDate: Date = new Date()
): SpoilageEvaluation {
  const exp = new Date(expiryDateStr);
  const diffMs = exp.setHours(0, 0, 0, 0) - new Date(nowDate).setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // High Risk: <= 1 day left OR 'use_by' with <= 2 days left
  if (daysLeft <= 1 || (dateType === 'use_by' && daysLeft <= 2)) {
    return {
      daysLeft,
      riskLevel: 'high',
      suggestedAction: dateType === 'use_by' ? 'Cook or freeze' : 'Add to tonight',
      safetyNotice: dateType === 'use_by'
        ? 'Use-by date concerns food safety. Do not consume if expired.'
        : undefined
    };
  }

  // Medium Risk: 2-3 days left
  if (daysLeft <= 3) {
    return {
      daysLeft,
      riskLevel: 'medium',
      suggestedAction: category === 'Produce' ? 'Smoothie / Stir-fry' : 'Plan meal'
    };
  }

  return {
    daysLeft,
    riskLevel: 'low',
    suggestedAction: 'Keep chilled'
  };
}
