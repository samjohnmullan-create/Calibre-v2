import assert from 'node:assert/strict'
import test from 'node:test'
import {
  scoreComplementaryDonorPair,
  scoreDonorMovementCompatibility,
} from '../src/lib/donorIntelligence.ts'

function assessment(itemId, componentKey, componentLabel, condition, confidence = 'confirmed', inventoryState = 'installed') {
  return { itemId, componentKey, componentLabel, condition, confidence, inventoryState }
}

test('same maker and exact calibre creates a strong movement compatibility lead', () => {
  const result = scoreDonorMovementCompatibility(
    { movementMaker: 'Elgin', calibre: '315' },
    { movementMaker: 'Elgin', calibre: '315' },
  )
  assert.equal(result.score, 96)
  assert.ok(result.reasons.includes('Same maker and exact Passport calibre'))
})

test('component complementarity cannot manufacture movement compatibility', () => {
  const result = scoreComplementaryDonorPair(
    8,
    [assessment('a', 'balance_assembly', 'Balance assembly', 'good')],
    [assessment('b', 'balance_assembly', 'Balance assembly', 'damaged')],
  )
  assert.equal(result.qualifies, false)
  assert.deepEqual(result.complements, ['Balance assembly'])
})

test('usable component against damaged component is recorded as complementary evidence', () => {
  const result = scoreComplementaryDonorPair(
    88,
    [assessment('a', 'balance_assembly', 'Balance assembly', 'usable')],
    [assessment('b', 'balance_assembly', 'Balance assembly', 'damaged')],
  )
  assert.equal(result.qualifies, true)
  assert.deepEqual(result.complements, ['Balance assembly'])
  assert.equal(result.score, 92)
})

test('harvested component no longer contributes to donor-pair complementarity', () => {
  const result = scoreComplementaryDonorPair(
    88,
    [assessment('a', 'balance_assembly', 'Balance assembly', 'good', 'confirmed', 'harvested')],
    [assessment('b', 'balance_assembly', 'Balance assembly', 'damaged')],
  )
  assert.equal(result.qualifies, true)
  assert.deepEqual(result.complements, [])
  assert.deepEqual(result.gaps, [])
  assert.equal(result.score, 88)
})

test('two damaged copies create a shared gap rather than a complement', () => {
  const result = scoreComplementaryDonorPair(
    88,
    [assessment('a', 'escapement', 'Escapement', 'damaged')],
    [assessment('b', 'escapement', 'Escapement', 'missing')],
  )
  assert.deepEqual(result.complements, [])
  assert.deepEqual(result.gaps, ['Escapement'])
  assert.equal(result.score, 82)
})

test('unknown and untested condition never create positive donor evidence', () => {
  const result = scoreComplementaryDonorPair(
    88,
    [assessment('a', 'train', 'Wheel train', 'unknown', 'unknown')],
    [assessment('b', 'train', 'Wheel train', 'untested', 'unknown')],
  )
  assert.deepEqual(result.complements, [])
  assert.deepEqual(result.gaps, [])
  assert.equal(result.score, 88)
})
