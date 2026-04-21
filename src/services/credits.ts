import { CreditAction } from "../types";

export const creditCosts: Record<CreditAction, number> = {
  profileSummary: 1,
  organizeSkills: 1,
  rewriteBullets: 1,
  analyzeJob: 1,
  optimizeCv: 1,
  atsCheck: 1,
  interviewQuestions: 1,
  interviewAnswers: 1,
  purchase: 0,
  restore: 0
};

export function getCreditCost(action: CreditAction) {
  return creditCosts[action] ?? 0;
}
