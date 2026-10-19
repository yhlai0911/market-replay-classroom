import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIndicators, defaultIndicatorSettings, normalizeIndicatorSettings, requiredWarmup } from '../dist/indicators.js';

const disabled = () => Object.fromEntries(Object.entries(defaultIndicatorSettings()).map(([key, value]) => [key, key.endsWith('Enabled') ? false : value]));
const bars = closes => closes.map((close, index) => ({ date: `day-${index}`, close, high: close + 1, low: close - 1, volume: (index + 1) * 100 }));
const closeTo = (actual, expected, epsilon = 1e-10) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
const settingsFor = fields => ({ ...disabled(), ...fields });

test('settings normalization creates independent defaults and safely validates every parameter', () => {
  const defaults = defaultIndicatorSettings();
  defaults.smaPeriod = 99;
  assert.equal(defaultIndicatorSettings().smaPeriod, 20);
  assert.deepEqual(normalizeIndicatorSettings(), defaultIndicatorSettings());
  const original = { smaPeriod: '12', kdKSmoothing: '1', bbDeviations: '1.5', unrecognized: 7 };
  const normalized = normalizeIndicatorSettings(original);
  assert.equal(normalized.smaPeriod, 12);
  assert.equal(normalized.kdKSmoothing, 1);
  assert.equal(normalized.bbDeviations, 1.5);
  assert.equal('unrecognized' in normalized, false);
  assert.equal(original.smaPeriod, '12');
  for (const key of ['smaPeriod', 'emaPeriod', 'bbPeriod', 'rsiPeriod', 'macdFast', 'macdSlow', 'macdSignal', 'kdLookback', 'volumeMAPeriod']) {
    for (const value of [1, 0, -1, 2.5, 121, Infinity, NaN, '', null, true, {}, []]) {
      assert.throws(() => normalizeIndicatorSettings({ [key]: value }), { name: 'RangeError' }, `${key}=${value}`);
    }
  }
  for (const key of ['kdKSmoothing', 'kdDSmoothing']) {
    assert.equal(normalizeIndicatorSettings({ [key]: 1 })[key], 1);
    assert.equal(normalizeIndicatorSettings({ [key]: 120 })[key], 120);
    for (const value of [0, 121, 1.5, Infinity]) assert.throws(() => normalizeIndicatorSettings({ [key]: value }));
  }
  for (const value of [0, -1, 5.1, Infinity, NaN, '', true]) assert.throws(() => normalizeIndicatorSettings({ bbDeviations: value }));
  for (const key of Object.keys(disabled()).filter(key => key.endsWith('Enabled'))) {
    for (const value of ['false', 0, 1, null]) assert.throws(() => normalizeIndicatorSettings({ [key]: value }));
  }
  assert.throws(() => normalizeIndicatorSettings({ macdFast: 26, macdSlow: 26 }));
  assert.throws(() => normalizeIndicatorSettings({ macdFast: 27, macdSlow: 26 }));
  for (const value of [null, [], 20, 'settings']) assert.throws(() => normalizeIndicatorSettings(value));
});

test('required warmup includes RSI changes and MACD signal seed, and only enabled indicators', () => {
  assert.equal(requiredWarmup(disabled()), 0);
  assert.equal(requiredWarmup(), 0);
  for (const [fields, expected] of [
    [{ smaEnabled: true, smaPeriod: 120 }, 120],
    [{ emaEnabled: true, emaPeriod: 120 }, 120],
    [{ bbEnabled: true, bbPeriod: 120 }, 120],
    [{ rsiEnabled: true, rsiPeriod: 120 }, 121],
    [{ macdEnabled: true, macdFast: 119, macdSlow: 120, macdSignal: 120 }, 239],
    [{ kdEnabled: true, kdLookback: 120, kdKSmoothing: 120, kdDSmoothing: 120 }, 120],
    [{ volumeMAEnabled: true, volumeMAPeriod: 120 }, 120]
  ]) assert.equal(requiredWarmup(settingsFor(fields)), expected);
});

test('SMA uses complete periods and EMA uses an SMA seed followed by alpha=2/(N+1)', () => {
  const result = calculateIndicators(bars([1, 2, 3, 5, 7]), settingsFor({ smaEnabled: true, smaPeriod: 3, emaEnabled: true, emaPeriod: 3 }));
  assert.deepEqual(result.series.sma.slice(0, 3), [null, null, 2]);
  closeTo(result.series.sma[3], 10 / 3);
  closeTo(result.series.sma[4], 5);
  assert.deepEqual(result.series.ema, [null, null, 2, 3.5, 5.25]);
  assert.equal(result.latest.ema, 5.25);
  assert.equal(result.latest.rsi, null);
});

test('Bollinger bands use the selected deviation multiplier and population standard deviation', () => {
  const result = calculateIndicators(bars([1, 2, 3, 4]), settingsFor({ bbEnabled: true, bbPeriod: 3, bbDeviations: 2 }));
  assert.deepEqual(result.series.bbMiddle, [null, null, 2, 3]);
  assert.deepEqual(result.series.bbUpper.slice(0, 2), [null, null]);
  closeTo(result.series.bbUpper[2], 2 + 2 * Math.sqrt(2 / 3));
  closeTo(result.series.bbLower[2], 2 - 2 * Math.sqrt(2 / 3));
  closeTo(result.series.bbUpper[3], 3 + 2 * Math.sqrt(2 / 3));
  const half = calculateIndicators(bars([1, 2, 3]), settingsFor({ bbEnabled: true, bbPeriod: 3, bbDeviations: 0.5 }));
  closeTo(half.latest.bbUpper, 2 + 0.5 * Math.sqrt(2 / 3));
});

test('RSI seeds N changes, applies Wilder smoothing, and defines flat/up/down behavior', () => {
  const config = settingsFor({ rsiEnabled: true, rsiPeriod: 3 });
  const result = calculateIndicators(bars([1, 2, 3, 2, 4, 3]), config).series.rsi;
  assert.deepEqual(result.slice(0, 3), [null, null, null]);
  closeTo(result[3], 200 / 3);
  closeTo(result[4], 250 / 3);
  closeTo(result[5], 2000 / 33);
  assert.deepEqual(calculateIndicators(bars([5, 5, 5, 5, 5]), config).series.rsi, [null, null, null, 50, 50]);
  assert.deepEqual(calculateIndicators(bars([1, 2, 3, 4, 5]), config).series.rsi, [null, null, null, 100, 100]);
  assert.deepEqual(calculateIndicators(bars([5, 4, 3, 2, 1]), config).series.rsi, [null, null, null, 0, 0]);
});

test('MACD uses independent SMA-seeded fast/slow EMAs and a separately seeded signal EMA', () => {
  const result = calculateIndicators(bars([1, 2, 3, 5, 7, 6]), settingsFor({ macdEnabled: true, macdFast: 2, macdSlow: 3, macdSignal: 2 }));
  assert.deepEqual(result.series.macd.slice(0, 2), [null, null]);
  closeTo(result.series.macd[2], 0.5);
  closeTo(result.series.macd[3], 2 / 3);
  closeTo(result.series.macd[4], 29 / 36);
  assert.deepEqual(result.series.macdSignal.slice(0, 3), [null, null, null]);
  closeTo(result.series.macdSignal[3], 7 / 12);
  closeTo(result.series.macdSignal[4], 79 / 108);
  closeTo(result.series.macdHistogram[3], 1 / 12);
  closeTo(result.series.macdHistogram[4], 2 / 27);
});

test('KD uses trailing high/low, 50 initial state, configurable K/D smoothing and neutral zero range', () => {
  const input = [{ close: 5, high: 10, low: 0 }, { close: 8, high: 10, low: 0 }, { close: 2, high: 10, low: 0 }];
  const result = calculateIndicators(input, settingsFor({ kdEnabled: true, kdLookback: 2, kdKSmoothing: 3, kdDSmoothing: 3 }));
  assert.equal(result.series.k[0], null);
  assert.equal(result.series.d[0], null);
  closeTo(result.series.k[1], 60);
  closeTo(result.series.d[1], 160 / 3);
  closeTo(result.series.k[2], 140 / 3);
  closeTo(result.series.d[2], 460 / 9);
  const unsmoothed = calculateIndicators(input, settingsFor({ kdEnabled: true, kdLookback: 2, kdKSmoothing: 1, kdDSmoothing: 1 }));
  assert.deepEqual(unsmoothed.series.k, [null, 80, 20]);
  assert.deepEqual(unsmoothed.series.d, [null, 80, 20]);
  const flat = calculateIndicators(Array.from({ length: 3 }, () => ({ high: 5, low: 5, close: 5 })), settingsFor({ kdEnabled: true, kdLookback: 2 }));
  closeTo(flat.latest.k, 50);
  closeTo(flat.latest.d, 50);
});

test('volume moving average prefers split-comparable volume, falls back to raw volume, and retains zeros', () => {
  const input = [{ volume: 10, comparableVolume: 40 }, { volume: 20 }, { volume: 99, comparableVolume: 0 }, { volume: 60, comparableVolume: null }];
  const result = calculateIndicators(input, settingsFor({ volumeMAEnabled: true, volumeMAPeriod: 2 }));
  assert.deepEqual(result.series.volumeMA, [null, 30, 10, 30]);
  assert.equal(result.latest.volumeMA, 30);
});

test('disabled and short-history indicators stay null; empty input exposes complete stable output shape', () => {
  const empty = calculateIndicators([], {});
  const expected = ['sma', 'ema', 'bbMiddle', 'bbUpper', 'bbLower', 'rsi', 'macd', 'macdSignal', 'macdHistogram', 'k', 'd', 'volumeMA'];
  assert.deepEqual(Object.keys(empty.series), expected);
  assert.deepEqual(Object.keys(empty.latest), expected);
  assert.ok(Object.values(empty.series).every(values => values.length === 0));
  assert.ok(Object.values(empty.latest).every(value => value === null));
  for (const input of [disabled(), defaultIndicatorSettings()]) {
    const result = calculateIndicators(bars([1]), input);
    assert.ok(Object.values(result.series).every(values => values.length === 1 && values[0] === null));
    assert.ok(Object.values(result.latest).every(value => value === null));
  }
  assert.throws(() => calculateIndicators(null));
});

test('all indicators are prefix invariant, finite-or-null, and leave input bars/settings untouched', () => {
  const input = bars(Array.from({ length: 55 }, (_, i) => 100 + Math.sin(i / 3) * 7 + i / 10));
  const settings = { ...Object.fromEntries(Object.entries(defaultIndicatorSettings()).map(([key, value]) => [key, key.endsWith('Enabled') ? true : value])), smaPeriod: 5, emaPeriod: 7, bbPeriod: 5, rsiPeriod: 5, macdFast: 3, macdSlow: 7, macdSignal: 4, kdLookback: 5, volumeMAPeriod: 5 };
  const originalBars = structuredClone(input), originalSettings = structuredClone(settings);
  const full = calculateIndicators(input, settings);
  for (let length = 0; length <= input.length; length++) {
    const prefix = calculateIndicators(input.slice(0, length), settings);
    for (const key of Object.keys(full.series)) {
      assert.deepEqual(prefix.series[key], full.series[key].slice(0, length), `${key}: prefix ${length}`);
      assert.equal(prefix.latest[key], prefix.series[key].at(-1) ?? null);
      assert.ok(prefix.series[key].every(value => value === null || Number.isFinite(value)));
    }
  }
  assert.deepEqual(input, originalBars);
  assert.deepEqual(settings, originalSettings);
});

test('missing or nonfinite input does not become zero or poison subsequent moving-average seeds', () => {
  const input = bars([1, 2, 3, NaN, 4, 5, 6]);
  const result = calculateIndicators(input, settingsFor({ smaEnabled: true, smaPeriod: 2, emaEnabled: true, emaPeriod: 2, rsiEnabled: true, rsiPeriod: 2 }));
  assert.deepEqual(result.series.sma, [null, 1.5, 2.5, null, null, 4.5, 5.5]);
  assert.deepEqual(result.series.ema, [null, 1.5, 2.5, null, null, 4.5, 5.5]);
  assert.deepEqual(result.series.rsi, [null, null, 100, null, null, null, 100]);
});
