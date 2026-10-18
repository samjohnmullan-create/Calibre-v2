export type DonorComponentCondition = 'unknown' | 'good' | 'usable' | 'worn' | 'damaged' | 'missing' | 'untested'

export type DonorAssessmentConfidence = 'confirmed' | 'strong' | 'probable' | 'possible' | 'unknown'

export type DonorComponentInventoryState = 'installed' | 'harvested'

export type DonorComponentAssessment = {
  itemId: string
  componentKey: string
  componentLabel: string
  condition: DonorComponentCondition
  confidence: DonorAssessmentConfidence
  inventoryState?: DonorComponentInventoryState
  evidenceNote?: string
}

export type DonorMovementProfile = {
  knowledgeMovementId?: string | null
  movementMaker?: string | null
  calibre?: string | null
  calibreFamily?: string | null
  movementType?: string | null
  movementDiameterMm?: number | null
  settingSystem?: string | null
  beatRate?: number | null
}

export type DonorPairConditionResult = {
  score: number
  compatibilityScore: number
  complements: string[]
  gaps: string[]
  reasons: string[]
  qualifies: boolean
}

const usefulConditions = new Set<DonorComponentCondition>(['good', 'usable'])
const problemConditions = new Set<DonorComponentCondition>(['worn', 'damaged', 'missing'])

export const donorComponentCatalog = [
  ['balance_assembly', 'Balance assembly'],
  ['escapement', 'Escapement'],
  ['train', 'Wheel train'],
  ['barrel_mainspring', 'Barrel / mainspring'],
  ['keyless_setting', 'Keyless / setting works'],
  ['motion_works', 'Motion works'],
  ['plates_bridges', 'Plates / bridges'],
  ['dial', 'Dial'],
  ['hands', 'Hands'],
  ['case', 'Case'],
  ['crown_stem', 'Crown / stem'],
] as const

function norm(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  const left = norm(a)
  const right = norm(b)
  return Boolean(left && right && left === right)
}

export function scoreDonorMovementCompatibility(left?: DonorMovementProfile, right?: DonorMovementProfile) {
  if (!left || !right) return { score: 0, reasons: [] as string[] }
  let score = 0
  const reasons: string[] = []

  if (left.knowledgeMovementId && left.knowledgeMovementId === right.knowledgeMovementId) {
    score += 100
    reasons.push('Same identified Knowledge movement')
  } else if (sameText(left.calibre, right.calibre)) {
    score += sameText(left.movementMaker, right.movementMaker) ? 88 : 72
    reasons.push(sameText(left.movementMaker, right.movementMaker) ? 'Same maker and exact Passport calibre' : 'Exact Passport calibre')
  } else if (sameText(left.calibreFamily, right.calibreFamily)) {
    score += sameText(left.movementMaker, right.movementMaker) ? 56 : 44
    reasons.push('Same calibre family')
  }

  if (sameText(left.movementMaker, right.movementMaker)) {
    score += 8
    reasons.push('Same movement maker')
  }
  if (sameText(left.movementType, right.movementType)) score += 3
  if (sameText(left.settingSystem, right.settingSystem)) {
    score += 4
    reasons.push('Same setting system')
  }
  if (left.beatRate && right.beatRate && left.beatRate === right.beatRate) {
    score += 4
    reasons.push(`Same beat rate (${left.beatRate} BPH)`)
  }
  if (left.movementDiameterMm != null && right.movementDiameterMm != null) {
    const delta = Math.abs(left.movementDiameterMm - right.movementDiameterMm)
    if (delta <= 0.05) {
      score += 8
      reasons.push('Movement diameter effectively identical')
    } else if (delta <= 0.15) {
      score += 4
      reasons.push('Movement diameter within 0.15 mm')
    }
  }

  return { score: Math.min(score, 100), reasons }
}

export function isUsefulDonorCondition(condition: DonorComponentCondition) {
  return usefulConditions.has(condition)
}

export function isProblemDonorCondition(condition: DonorComponentCondition) {
  return problemConditions.has(condition)
}

export function isComponentStillInDonor(entry: DonorComponentAssessment | undefined) {
  return Boolean(entry && (entry.inventoryState ?? 'installed') === 'installed')
}

export function scoreComplementaryDonorPair(
  compatibilityScore: number,
  left: DonorComponentAssessment[],
  right: DonorComponentAssessment[],
): DonorPairConditionResult {
  const leftByKey = new Map(left.map((entry) => [entry.componentKey, entry]))
  const rightByKey = new Map(right.map((entry) => [entry.componentKey, entry]))
  const complements: string[] = []
  const gaps: string[] = []
  const reasons: string[] = []

  for (const [componentKey, componentLabel] of donorComponentCatalog) {
    const leftEntry = leftByKey.get(componentKey)
    const rightEntry = rightByKey.get(componentKey)
    if (!isComponentStillInDonor(leftEntry) || !isComponentStillInDonor(rightEntry)) continue

    const leftUseful = isUsefulDonorCondition(leftEntry!.condition)
    const rightUseful = isUsefulDonorCondition(rightEntry!.condition)
    const leftProblem = isProblemDonorCondition(leftEntry!.condition)
    const rightProblem = isProblemDonorCondition(rightEntry!.condition)

    if ((leftUseful && rightProblem) || (rightUseful && leftProblem)) {
      complements.push(componentLabel)
      reasons.push(`${componentLabel}: one donor is usable where the other has a recorded problem`)
    } else if (leftProblem && rightProblem) {
      gaps.push(componentLabel)
    }
  }

  const bonus = Math.min(12, complements.length * 4)
  const penalty = Math.min(18, gaps.length * 6)
  const score = Math.max(0, Math.min(100, compatibilityScore + bonus - penalty))

  return {
    score,
    compatibilityScore,
    complements,
    gaps,
    reasons,
    qualifies: compatibilityScore >= 50,
  }
}
