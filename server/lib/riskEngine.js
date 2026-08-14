/**
 * riskEngine.js
 * Rule-based risk scoring — mirrors the weights and thresholds
 * documented in the CIA-2 report and visible in the frontend JS.
 *
 * Formula:
 *   riskScore = phqNorm×0.5 + moodNorm×0.2 + sentimentNorm×0.3  (clamped 0-1)
 *   ≥ 0.66 → high  |  0.34–0.65 → moderate  |  < 0.34 → low
 *   crisis-phrase match → override to high, floor score at 0.85
 */

const DISTRESS_TERMS = [
  'anxious','exhausted','overwhelmed','hopeless','stressed','stress',
  'numb','down','tired','fumes','empty','worthless','panic','dread','drowning'
];

const POSITIVE_TERMS = [
  'great','grateful','good','better','productive','calm',
  'relieved','proud','happy','hopeful','fine'
];

const CRISIS_PHRASES = [
  "don't want to be here anymore",
  'want to die',
  'end it all',
  'no reason to live',
  'kill myself',
  'better off without me'
];

function scoreCheckin({ mood, phq1, phq2, text = '' }) {
  const lower = text.toLowerCase();

  // Sentiment from free text
  const distressMatches = DISTRESS_TERMS.filter(w => lower.includes(w));
  const positiveMatches = POSITIVE_TERMS.filter(w => lower.includes(w));
  const d = distressMatches.length;
  const p = positiveMatches.length;
  const sentiment     = (p - d) / (p + d + 1);   // -1..1 dampened
  const sentimentNorm = (1 - sentiment) / 2;       // 0..1, higher = more distress

  // PHQ-2 (0-6 range)
  const phqSum  = Number(phq1) + Number(phq2);
  const phqNorm = phqSum / 6;

  // Mood (1-5, inverted so low mood = high risk)
  const moodNorm = (5 - Number(mood)) / 4;

  // Weighted blend
  const phqContribution       = phqNorm       * 0.5;
  const moodContribution      = moodNorm       * 0.2;
  const sentimentContribution = sentimentNorm  * 0.3;

  let riskScore = phqContribution + moodContribution + sentimentContribution;
  riskScore = Math.max(0, Math.min(1, riskScore));

  // Crisis-phrase override
  let crisisFlag   = false;
  let matchedPhrase = null;
  const found = CRISIS_PHRASES.find(ph => lower.includes(ph));
  if (found) {
    crisisFlag    = true;
    matchedPhrase = found;
    riskScore     = Math.max(riskScore, 0.85);
  }

  const riskLevel = riskScore >= 0.66 ? 'high' : (riskScore >= 0.34 ? 'moderate' : 'low');

  // Dominant contributing factor
  const contributions = { phq: phqContribution, mood: moodContribution, sentiment: sentimentContribution };
  let dominant = 'phq';
  if (contributions.mood      > contributions[dominant]) dominant = 'mood';
  if (contributions.sentiment > contributions[dominant]) dominant = 'sentiment';

  // Core keyword
  let coreKeyword = null;
  let coreType    = null;
  if (crisisFlag)                      { coreKeyword = matchedPhrase;      coreType = 'crisis'; }
  else if (d > 0 && d >= p)           { coreKeyword = distressMatches[0]; coreType = 'distress'; }
  else if (p > 0)                      { coreKeyword = positiveMatches[0]; coreType = 'positive'; }

  const rationale = [
    `PHQ-2 score: ${phqSum}/6.`,
    `Mood slider: ${mood}/5.`,
    `${d} distress term(s)${d ? ': ' + distressMatches.join(', ') : ''}.`,
    `${p} positive term(s)${p ? ': ' + positiveMatches.join(', ') : ''}.`,
    crisisFlag
      ? `Crisis phrase matched: "${matchedPhrase}" — override to HIGH.`
      : 'No crisis phrase matched.',
    `Combined risk score: ${Math.round(riskScore * 100)}/100 → ${riskLevel.toUpperCase()}.`,
  ];

  return {
    riskScore: parseFloat(riskScore.toFixed(3)),
    riskLevel,
    crisisFlag,
    matchedPhrase,
    phqSum,
    distressMatches,
    positiveMatches,
    sentimentScore: parseFloat(sentiment.toFixed(3)),
    contributions,
    dominant,
    coreKeyword,
    coreType,
    rationale,
  };
}

module.exports = { scoreCheckin };
