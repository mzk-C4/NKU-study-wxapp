const fs = require('node:fs')
const path = require('node:path')
const { createGuideAssistant } = require('../server/src/guide-assistant')
const { createLearningCompassProjection, readLearningCompassData } = require('../server/src/learning-compass')

const projectRoot = path.resolve(__dirname, '..')
const knowledgePath = path.join(projectRoot, 'server/data/learning-compass.generated.json')
const fixturePath = path.join(projectRoot, 'server/test/fixtures/learning-compass-ai-eval.json')
const outputPath = path.join(projectRoot, 'server/data/learning-compass-ai-eval.generated.json')

function roundedPercent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10000) / 100 : 100
}

function hasInternalLeakage(value) {
  const serialized = JSON.stringify(value)
  return /Documents|markdown_path|original_path|server[\\/]data|password|token|[A-Za-z]:\\/i.test(serialized)
}

async function evaluate({ knowledgeBase, cases }) {
  const projection = createLearningCompassProjection(knowledgeBase)
  const assistant = createGuideAssistant({ learningCompass: projection })
  const results = []
  for (const item of cases) {
    const response = await assistant.answer({ question: item.question })
    const actualGuideId = response.refused ? 'refuse' : response.guide_id
    const actualSourceIds = response.citations.map(citation => citation.id)
    const guideMatches = actualGuideId === item.expected_guide_id
    const citationMatches = item.expected_guide_id === 'refuse'
      ? response.citations.length === 0
      : response.citations.length > 0 && actualSourceIds.includes(item.expected_source_id)
    const noLeakage = !hasInternalLeakage(response)
    results.push({
      question: item.question,
      expected_guide_id: item.expected_guide_id,
      expected_source_id: item.expected_source_id,
      actual_guide_id: actualGuideId,
      actual_source_ids: actualSourceIds,
      internal_leakage: !noLeakage,
      pass: guideMatches && citationMatches && noLeakage
    })
  }

  const hitResults = results.filter(item => item.expected_guide_id !== 'refuse')
  const refusalResults = results.filter(item => item.expected_guide_id === 'refuse')
  const passed = results.filter(item => item.pass).length
  const citationsPresent = hitResults.filter(item => item.actual_source_ids.length > 0 && item.actual_source_ids.includes(item.expected_source_id)).length
  const refusalsCorrect = refusalResults.filter(item => item.actual_guide_id === 'refuse' && item.actual_source_ids.length === 0).length
  const leakageCount = results.filter(item => item.internal_leakage).length
  const summary = {
    total: results.length,
    passed,
    failed: results.length - passed,
    accuracy_percent: roundedPercent(passed, results.length),
    hit_total: hitResults.length,
    citation_presence_percent: roundedPercent(citationsPresent, hitResults.length),
    refusal_total: refusalResults.length,
    refusal_accuracy_percent: roundedPercent(refusalsCorrect, refusalResults.length),
    internal_leakage_count: leakageCount
  }
  const gates = {
    accuracy_at_least_90: summary.accuracy_percent >= 90,
    hit_citations_100: summary.citation_presence_percent === 100,
    unsupported_refusal_100: summary.refusal_accuracy_percent === 100,
    internal_leakage_zero: summary.internal_leakage_count === 0
  }
  return {
    generated: true,
    knowledge_version: knowledgeBase.version,
    summary,
    gates,
    cases: results
  }
}

async function main() {
  const knowledgeBase = readLearningCompassData(knowledgePath)
  const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const result = await evaluate({ knowledgeBase, cases })
  const output = `${JSON.stringify(result, null, 2)}\n`
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
      console.error('learning compass AI evaluation data is missing or stale')
      process.exitCode = 1
      return
    }
    console.log(`learning compass AI evaluation is current: ${result.summary.passed}/${result.summary.total}, ${result.summary.accuracy_percent}%`)
  } else {
    fs.writeFileSync(outputPath, output, 'utf8')
    console.log(`evaluated ${result.summary.total} questions: ${result.summary.passed} PASS, ${result.summary.failed} FAIL, ${result.summary.accuracy_percent}%`)
  }
  if (!Object.values(result.gates).every(Boolean)) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { evaluate, hasInternalLeakage }
