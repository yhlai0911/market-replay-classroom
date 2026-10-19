// Every calculation is causal: callers pass only the already-revealed bars.
// Values before the first complete lookback/seed are null, never partial averages.
const DEFAULTS = Object.freeze({
  smaEnabled: false, smaPeriod: 20,
  emaEnabled: false, emaPeriod: 20,
  bbEnabled: false, bbPeriod: 20, bbDeviations: 2,
  rsiEnabled: false, rsiPeriod: 14,
  macdEnabled: false, macdFast: 12, macdSlow: 26, macdSignal: 9,
  kdEnabled: false, kdLookback: 9, kdKSmoothing: 3, kdDSmoothing: 3,
  volumeMAEnabled: false, volumeMAPeriod: 20
});
const PERIOD_NAMES = {
  smaPeriod: 'SMA 週期', emaPeriod: 'EMA 週期', bbPeriod: '布林通道週期',
  rsiPeriod: 'RSI 週期', macdFast: 'MACD 快線週期', macdSlow: 'MACD 慢線週期',
  macdSignal: 'MACD 訊號週期', kdLookback: 'KD 回看週期',
  kdKSmoothing: 'K 平滑週期', kdDSmoothing: 'D 平滑週期', volumeMAPeriod: '均量週期'
};
const SERIES_KEYS = ['sma', 'ema', 'bbMiddle', 'bbUpper', 'bbLower', 'rsi',
  'macd', 'macdSignal', 'macdHistogram', 'k', 'd', 'volumeMA'];

export function defaultIndicatorSettings() {
  return { ...DEFAULTS };
}

function numeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

// Merge missing fields with defaults. Reject invalid supplied values rather than
// silently changing the student's requested parameters. Form numeric strings work.
export function normalizeIndicatorSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('技術指標設定必須是物件');
  }
  const settings = defaultIndicatorSettings();
  for (const key of Object.keys(DEFAULTS)) {
    if (input[key] !== undefined) settings[key] = input[key];
    if (key.endsWith('Enabled') && typeof settings[key] !== 'boolean') {
      throw new TypeError('指標開關必須為布林值');
    }
  }
  for (const [key, label] of Object.entries(PERIOD_NAMES)) {
    const value = numeric(settings[key]);
    const minimum = key === 'kdKSmoothing' || key === 'kdDSmoothing' ? 1 : 2;
    if (!Number.isInteger(value) || value < minimum || value > 120) {
      throw new RangeError(`${label}必須為 ${minimum}–120 的整數`);
    }
    settings[key] = value;
  }
  settings.bbDeviations = numeric(settings.bbDeviations);
  if (!Number.isFinite(settings.bbDeviations) || settings.bbDeviations <= 0 || settings.bbDeviations > 5) {
    throw new RangeError('布林標準差倍數必須大於 0 且不超過 5');
  }
  if (settings.macdFast >= settings.macdSlow) {
    throw new RangeError('MACD 快線週期必須小於慢線週期');
  }
  if (Object.hasOwn(input, 'movingAverages')) {
    if (!Array.isArray(input.movingAverages) || input.movingAverages.length > 8) throw new RangeError('均線最多可加入 8 條');
    const ids = new Set();
    settings.movingAverages = input.movingAverages.map(line => {
      if (!line || typeof line !== 'object' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(line.id) || ids.has(line.id)) throw new TypeError('均線 ID 必須有效且不可重複');
      if (!['sma','ema'].includes(line.type)) throw new TypeError('均線類型必須為 SMA 或 EMA');
      const period = numeric(line.period);
      if (!Number.isInteger(period) || period < 2 || period > 120) throw new RangeError('均線週期必須為 2–120 的整數');
      if (typeof line.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(line.color)) throw new TypeError('均線顏色必須是六位十六進位色碼');
      ids.add(line.id);return {id:line.id,type:line.type,period,color:line.color.toLowerCase()};
    });
  }
  return settings;
}

// Explicit arrays are authoritative; absent arrays retain older single-line sessions.
export function movingAverageInstances(input = {}) {
  if (Array.isArray(input.movingAverages)) return input.movingAverages.map(line=>({...line}));
  return ['sma','ema'].filter(type=>input[type+'Enabled']).map(type=>({id:'legacy-'+type,type,period:input[type+'Period']??20,color:type==='sma'?'#f5c773':'#6faeff'}));
}
export const movingAverageSeriesKey = line => 'ma_'+(typeof line==='string'?line:line.id);

// Bars needed for the first defined value of every enabled output (not an EMA
// convergence guarantee). A 120-period RSI needs 121 closes; MACD can need 239.
export function requiredWarmup(input = {}) {
  const s = normalizeIndicatorSettings(input);
  return Math.max(0,
    ...movingAverageInstances(s).map(line=>line.period),
    s.bbEnabled ? s.bbPeriod : 0,
    s.rsiEnabled ? s.rsiPeriod + 1 : 0,
    s.macdEnabled ? s.macdSlow + s.macdSignal - 1 : 0,
    s.kdEnabled ? s.kdLookback : 0,
    s.volumeMAEnabled ? s.volumeMAPeriod : 0);
}

const average = values => values.reduce((sum, value) => sum + value / values.length, 0);
const finiteOrNull = value => Number.isFinite(value) ? value : null;

function movingAverage(values, period) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return window.every(Number.isFinite) ? finiteOrNull(average(window)) : null;
  });
}

// SMA-seeded EMA. Missing data breaks the seed; a new complete seed is required.
function exponentialAverage(values, period) {
  const result = Array(values.length).fill(null), seed = [];
  const alpha = 2 / (period + 1);
  let previous = null;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      seed.length = 0;
      previous = null;
      continue;
    }
    if (previous === null) {
      seed.push(value);
      if (seed.length < period) continue;
      previous = finiteOrNull(average(seed));
    } else {
      previous = finiteOrNull((1 - alpha) * previous + alpha * value);
    }
    result[i] = previous;
  }
  return result;
}

// Wilder RSI: seed with N close-to-close changes, then alpha = 1/N.
function relativeStrength(values, period) {
  const result = Array(values.length).fill(null);
  let previous = null, count = 0, gains = 0, losses = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      previous = null; count = 0; gains = 0; losses = 0;
      continue;
    }
    if (previous === null) {
      previous = value;
      continue;
    }
    const change = value - previous;
    previous = value;
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    if (count < period) {
      gains += gain / period;
      losses += loss / period;
      count++;
      if (count < period) continue;
    } else {
      gains = gains * (period - 1) / period + gain / period;
      losses = losses * (period - 1) / period + loss / period;
    }
    // Flat prices are neutral; an all-up/all-down seed is 100/0 respectively.
    result[i] = finiteOrNull(gains === 0 && losses === 0 ? 50 :
      losses === 0 ? 100 : 100 - 100 / (1 + gains / losses));
  }
  return result;
}

export function calculateIndicators(bars, input = {}) {
  if (!Array.isArray(bars)) throw new TypeError('行情必須是陣列');
  const settings = normalizeIndicatorSettings(input);
  const series = Object.fromEntries(SERIES_KEYS.map(key => [key, Array(bars.length).fill(null)]));
  const closes = bars.map(bar => bar?.close);

  for (const line of movingAverageInstances(settings)) series[movingAverageSeriesKey(line)] = (line.type==='sma'?movingAverage:exponentialAverage)(closes,line.period);
  if (!Object.hasOwn(settings,'movingAverages') && settings.smaEnabled) series.sma = movingAverage(closes, settings.smaPeriod);
  if (!Object.hasOwn(settings,'movingAverages') && settings.emaEnabled) series.ema = exponentialAverage(closes, settings.emaPeriod);
  if (settings.bbEnabled) {
    const period = settings.bbPeriod;
    series.bbMiddle = movingAverage(closes, period);
    for (let i = period - 1; i < bars.length; i++) {
      const middle = series.bbMiddle[i];
      if (middle === null) continue;
      // Population standard deviation (divide by N, not N-1).
      const deviations = closes.slice(i - period + 1, i + 1).map(value => value - middle);
      const spread = settings.bbDeviations * Math.hypot(...deviations) / Math.sqrt(period);
      series.bbUpper[i] = finiteOrNull(middle + spread);
      series.bbLower[i] = finiteOrNull(middle - spread);
    }
  }
  if (settings.rsiEnabled) series.rsi = relativeStrength(closes, settings.rsiPeriod);
  if (settings.macdEnabled) {
    const fast = exponentialAverage(closes, settings.macdFast);
    const slow = exponentialAverage(closes, settings.macdSlow);
    series.macd = fast.map((value, i) => value === null || slow[i] === null ? null : finiteOrNull(value - slow[i]));
    series.macdSignal = exponentialAverage(series.macd, settings.macdSignal);
    // Histogram is MACD minus signal, without the optional charting convention ×2.
    series.macdHistogram = series.macd.map((value, i) => value === null || series.macdSignal[i] === null ? null :
      finiteOrNull(value - series.macdSignal[i]));
  }
  if (settings.kdEnabled) {
    let k = 50, d = 50;
    for (let i = settings.kdLookback - 1; i < bars.length; i++) {
      const window = bars.slice(i - settings.kdLookback + 1, i + 1);
      if (!window.every(bar => Number.isFinite(bar?.high) && Number.isFinite(bar?.low) && bar.high >= bar.low) ||
          !Number.isFinite(closes[i])) {
        k = 50; d = 50;
        continue;
      }
      const high = Math.max(...window.map(bar => bar.high));
      const low = Math.min(...window.map(bar => bar.low));
      const rsv = high === low ? 50 : (closes[i] - low) / (high - low) * 100;
      k = k * (settings.kdKSmoothing - 1) / settings.kdKSmoothing + rsv / settings.kdKSmoothing;
      d = d * (settings.kdDSmoothing - 1) / settings.kdDSmoothing + k / settings.kdDSmoothing;
      series.k[i] = finiteOrNull(k);
      series.d[i] = finiteOrNull(d);
    }
  }
  if (settings.volumeMAEnabled) {
    series.volumeMA = movingAverage(bars.map(bar => bar?.comparableVolume ?? bar?.volume), settings.volumeMAPeriod);
  }
  const latest = Object.fromEntries(Object.keys(series).map(key => [key, series[key].at(-1) ?? null]));
  return { series, latest };
}
