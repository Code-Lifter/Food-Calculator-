// target-maths.js — Step 1 maths: BMR → activity → goal → daily calories and macros (plus runTargetTests for ?test).

// --- Target maths: BMR → activity → goal → macros ---
// Pure functions (no state or DOM) so they can be checked on their own: open the page with ?test.
// `body` is { sex, kg, cm, age, job, trainingHrs, bfPct (number or null), fatPct, goal (a GOALS key) }.

// Job sets the base PAL; each weekly training hour adds 0.03, capped at 2.4 (elite-athlete territory)
const JOB_PAL = { desk: 1.4, onFeet: 1.6, manual: 1.8, heavy: 2.0 };
const PAL_PER_TRAINING_HOUR = 0.03, PAL_MAX = 2.4;

// Goal = a % of maintenance (TDEE), so the change scales with the person instead of a fixed ±kcal
const GOALS = {
  cutGentle: { pct: -0.10, desc: 'Cut · gentle: −10% of maintenance' },
  cut: { pct: -0.15, desc: 'Cut · standard: −15% of maintenance' },
  cutFast: { pct: -0.20, desc: 'Cut · fast: −20% of maintenance' },
  maintain: { pct: 0, desc: 'Maintenance calories' },
  bulkLean: { pct: 0.05, desc: 'Bulk · lean: +5% of maintenance' },
  bulk: { pct: 0.10, desc: 'Bulk · standard: +10% of maintenance' },
  bulkFast: { pct: 0.15, desc: 'Bulk · fast: +15% of maintenance' }
};
// The speed toggle under Cut and Bulk: [stored value, label, GOALS key]; standard is the default
const SPEEDS = {
  cut: [['gentle', 'Gentle', 'cutGentle'], ['standard', 'Standard', 'cut'], ['fast', 'Fast', 'cutFast']],
  bulk: [['lean', 'Lean', 'bulkLean'], ['standard', 'Standard', 'bulk'], ['fast', 'Fast', 'bulkFast']]
};
const speedOf = s => (SPEEDS[s.goal] || []).find(([v]) => v === s[`${s.goal}Speed`]) || (SPEEDS[s.goal] || [])[1];
const goalKey = s => SPEEDS[s.goal] ? speedOf(s)[2] : 'maintain';

// Lowest daily target the calculator will give without a professional involved
const KCAL_FLOOR = { female: 1200, male: 1500 };
const KCAL_PER_KG = 7700; // rough energy in 1 kg of body weight change; the rate shown is only an estimate
const KJ_PER_KCAL = 4.184;

// Accepted ranges, after converting lbs/in to kg/cm: [min, max, unit, name]
const STAT_LIMITS = {
  age: [18, 80, '', 'age'], weight: [35, 250, ' kg', 'weight'], height: [130, 220, ' cm', 'height'],
  bfPct: [3, 60, '%', 'body fat'], fatPct: [20, 35, '%', 'fat %'], trainingHrs: [0, 20, ' h', 'training hours']
};

// Weight used for protein and the fat floor. Above BMI 30 it's capped at the weight for BMI 25,
// so protein isn't driven by fat mass. A practical design choice, not a published formula.
function refWeight(kg, cm) {
  const h2 = (cm / 100) ** 2;
  return kg / h2 > 30 ? 25 * h2 : kg;
}
const fatFreeMass = b => b.bfPct != null ? b.kg * (1 - b.bfPct / 100) : null;

// Mifflin-St Jeor by default; Cunningham (built on fat-free mass) only when a measured body fat % is given
function bmrFor(b) {
  const ffm = fatFreeMass(b);
  if (ffm != null) return { bmr: 500 + 22 * ffm, formula: 'Cunningham (uses your body fat %)' };
  return { bmr: 10 * b.kg + 6.25 * b.cm - 5 * b.age + (b.sex === 'female' ? -161 : 5), formula: 'Mifflin-St Jeor' };
}

// Protein and fat first, carbs fill the rest. If protein + fat leave no room, fat drops to its floor,
// then protein to 1.6 g/kg, and only then are carbs clamped at 0 (the one case the macros can't add up).
// P and F are rounded before C is worked out, so 4P + 4C + 9F lands within ±2 kcal of the target.
function macrosFor(kcal, b) {
  const ref = refWeight(b.kg, b.cm);
  const ffm = fatFreeMass(b);
  const cutting = b.goal.startsWith('cut');
  let protein = Math.round(ffm != null ? (cutting ? 2.6 : 2.2) * ffm : (cutting ? 2.2 : 1.8) * ref);
  const fatFloor = Math.ceil(Math.max(0.2 * kcal / 9, 0.5 * ref));
  let fat = Math.max(Math.round((b.fatPct / 100) * kcal / 9), fatFloor);
  const carbsLeft = () => Math.round((kcal - 4 * protein - 9 * fat) / 4);
  let carbs = carbsLeft();
  const notes = [];
  let clamped = false;
  if (carbs < 0) { fat = fatFloor; carbs = carbsLeft(); }
  if (carbs < 0) { protein = Math.min(protein, Math.round(1.6 * ref)); carbs = carbsLeft(); }
  if (carbs < 0) {
    carbs = 0;
    clamped = true;
    notes.push('Target too low for these inputs – review your goal');
  }
  if (b.trainingHrs > 0 && carbs / b.kg < 3) notes.push('Carbs below 3 g/kg – may limit training quality');
  const sum = 4 * protein + 4 * carbs + 9 * fat;
  const sumOk = clamped || Math.abs(sum - kcal) <= 5;
  if (!sumOk) console.warn(`macrosFor: macros add up to ${sum} kcal, target ${kcal}`);
  return { protein, carbs, fat, notes, clamped, sum, sumOk };
}

// Everything the live targets need (edit.js), plus the notes to show under them
function targetsFor(b) {
  const { bmr, formula } = bmrFor(b);
  const pal = Math.min(PAL_MAX, JOB_PAL[b.job] + PAL_PER_TRAINING_HOUR * b.trainingHrs);
  const tdee = bmr * pal;
  let target = Math.round(tdee * (1 + GOALS[b.goal].pct));
  const notes = [];
  let floored = false;
  if (target < KCAL_FLOOR[b.sex]) {
    target = KCAL_FLOOR[b.sex];
    floored = true;
    notes.push('Floor applied – see a dietitian for lower intakes');
  }
  if (target < bmr) notes.push(`Target is below your BMR (≈ ${Math.round(bmr)} kcal, what your body burns at rest) – best kept short-term`);
  // Energy availability per kg of fat-free mass; exercise energy isn't counted yet, so this flatters it
  const ffm = fatFreeMass(b);
  if (ffm != null && target / ffm < 30) notes.push('Very low energy availability – risk of RED-S');
  const macros = macrosFor(target, b);
  return {
    bmr, formula, pal, tdee, target, floored, macros,
    kgPerWeek: (target - tdee) * 7 / KCAL_PER_KG,
    notes: [...notes, ...macros.notes]
  };
}

// Reads the stats form: lbs/in become kg/cm first, then every value is range-checked.
// Returns { body } when it can calculate, otherwise { missing } / { minor } / { invalid }.
function bodyFromStats(s) {
  const num = k => s[k] === '' || s[k] == null ? null : parseFloat(s[k]);
  const lbs = s.unit === 'lbs';
  const v = {
    weight: num('weight') != null && lbs ? num('weight') * 0.453592 : num('weight'),
    height: num('height') != null && lbs ? num('height') * 2.54 : num('height'),
    age: num('age'),
    bfPct: num('bfPct'),
    fatPct: num('fatPct') ?? 25,
    trainingHrs: num('trainingHrs') ?? 0
  };
  const missing = ['weight', 'height', 'age'].filter(k => !(v[k] > 0));
  if (missing.length) return { missing };
  if (v.age < 18) return { minor: true, invalid: ['age'] };
  const invalid = Object.entries(STAT_LIMITS).filter(([k, [lo, hi]]) => v[k] != null && !(v[k] >= lo && v[k] <= hi)).map(([k]) => k);
  if (invalid.length) return { invalid };
  return { body: {
    sex: s.gender === 'female' ? 'female' : 'male', kg: v.weight, cm: v.height, age: v.age,
    job: JOB_PAL[s.job] ? s.job : 'desk', trainingHrs: v.trainingHrs, bfPct: v.bfPct, fatPct: v.fatPct, goal: goalKey(s)
  } };
}

// ?test in the URL logs these to the console. Case 3 as written doesn't reach the floor
// (it works out at ≈ 1,325 kcal), so case 4 is added to check the floor itself.
function runTargetTests() {
  const base = { trainingHrs: 0, bfPct: null, fatPct: 25 };
  const cases = [
    ['1. M 80kg 180cm 30y, on feet + 3h, cut', { ...base, sex: 'male', kg: 80, cm: 180, age: 30, job: 'onFeet', trainingHrs: 3, goal: 'cut' }, 'BMR 1780 · target ≈ TDEE × 0.85 · P 176 · fat ≈ 25% · sums to target'],
    ['2. F 110kg 165cm 45y, desk 0h, cut', { ...base, sex: 'female', kg: 110, cm: 165, age: 45, job: 'desk', goal: 'cut' }, 'ref ≈ 68 kg · P ≈ 150 · carbs > 0 · sums to target'],
    ['3. F 50kg 155cm 25y, desk, cutFast', { ...base, sex: 'female', kg: 50, cm: 155, age: 25, job: 'desk', goal: 'cutFast' }, 'brief expects the floor (1200)'],
    ['4. F 45kg 150cm 60y, desk, cutFast', { ...base, sex: 'female', kg: 45, cm: 150, age: 60, job: 'desk', goal: 'cutFast' }, 'floor applied at 1200']
  ];
  const rows = cases.map(([name, b, expect]) => {
    const t = targetsFor(b);
    const m = t.macros;
    return {
      case: name, expect, bmr: Math.round(t.bmr), tdee: Math.round(t.tdee), 'target/tdee': +(t.target / t.tdee).toFixed(3),
      target: t.target, floored: t.floored, refKg: +refWeight(b.kg, b.cm).toFixed(1), P: m.protein, C: m.carbs, F: m.fat,
      'fat %': +(9 * m.fat / t.target * 100).toFixed(1), sum: m.sum, sumOk: m.sumOk, notes: t.notes.join(' | ')
    };
  });
  console.table(rows);
  return rows;
}
// --- end of target maths ---
