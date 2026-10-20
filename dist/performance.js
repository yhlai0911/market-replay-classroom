import {fresh, decide, wealth, benchmark, mark} from './engine.js?v=preview-v11';

const percentage = (part, whole) => whole > 0 ? part / whole * 100 : 0;
const returnPercent = (value, initial) => percentage(value - initial, initial);

/**
 * Pure, as-of performance facts rebuilt from completed decisions.
 *
 * Point series contain the initial cash balance and completed closes only.
 * Returns and exposures are percentages. Point drawdowns are non-positive
 * percentages; maximum drawdowns are their positive magnitudes. Turnover is
 * gross filled notional / initial capital, with turnoverPercent also provided.
 * Mean exposure is the arithmetic mean of completed-close holding value /
 * equity, excluding the initial cash-only point. No hypothetical liquidation,
 * dividend reinvestment, annualization, Sharpe ratio or win rate is introduced.
 */
export function performanceModel(s, state) {
  if (!Array.isArray(state?.journal) || state.journal.length > s.rounds.length) {
    throw Error('無法計算績效：已完成決策紀錄格式不正確。');
  }
  const initialAssets = s.initialCash;
  const counts = {decisions:state.journal.length, fills:0, buys:0, sells:0, holds:0, cancelled:0};
  const points = [{
    index:0, date:null, at:null, equity:initialAssets, benchmark:initialAssets,
    portfolioReturn:0, benchmarkReturn:0, drawdown:0, benchmarkDrawdown:0,
    exposure:0, cash:initialAssets, shares:0, holdingValue:0, receivables:0,
  }];
  let replay = fresh(s), peak = initialAssets, benchmarkPeak = initialAssets;
  let maxDrawdown = 0, benchmarkMaxDrawdown = 0, grossNotional = 0;

  for (let i = 0; i < state.journal.length; i++) {
    const intent = state.journal[i], round = s.rounds[i];
    const priorReceivables = replay.receivable ?? 0;
    const priorClaimCount = replay.claims?.length ?? 0;
    replay = decide(s, replay, intent.side, intent.requestedQuantity ?? intent.quantity, intent.reason);
    const fill = replay.journal.at(-1);
    const equity = replay.equity.at(-1);
    const holdingValue = fill.shares * round.close;
    // decide settles claims after recording this close (at the next decision
    // cutoff). Keep close components before that settlement and next-day split.
    const receivables = priorReceivables + replay.claims.slice(priorClaimCount).reduce((sum, claim) => sum + claim.amount, 0);
    // A finished prefix marks THIS close. Using the live replay directly here
    // would use the next session's reference price and share-split basis.
    const closedScenario = {...s, rounds:s.rounds.slice(0, i + 1)};
    const base = benchmark(closedScenario, {...replay, index:i, finished:true});
    peak = Math.max(peak, equity);
    benchmarkPeak = Math.max(benchmarkPeak, base);
    const drawdown = percentage(equity - peak, peak);
    const benchmarkDrawdown = percentage(base - benchmarkPeak, benchmarkPeak);
    maxDrawdown = Math.max(maxDrawdown, -drawdown);
    benchmarkMaxDrawdown = Math.max(benchmarkMaxDrawdown, -benchmarkDrawdown);
    points.push({
      index:i + 1, date:round.at.slice(0, 10), at:round.closeAt ?? round.bar?.closeAt ?? null,
      equity, benchmark:base, portfolioReturn:returnPercent(equity, initialAssets),
      benchmarkReturn:returnPercent(base, initialAssets), drawdown, benchmarkDrawdown,
      exposure:percentage(holdingValue, equity), cash:fill.cash, shares:fill.shares,
      holdingValue, receivables,
    });
    if (fill.status === 'filled' && fill.quantity > 0) {
      counts.fills++;
      if (fill.side === 'buy') counts.buys++;
      if (fill.side === 'sell') counts.sells++;
      grossNotional += Math.abs(fill.quantity * fill.price);
    } else if (fill.status === 'cancelled') {
      counts.cancelled++;
    } else if (fill.side === 'hold') {
      counts.holds++;
    }
  }

  const currentAssets = wealth(s, replay), benchmarkAssets = benchmark(s, replay);
  const holdingValue = replay.shares * mark(s, replay);
  const portfolioReturn = returnPercent(currentAssets, initialAssets);
  const benchmarkReturn = returnPercent(benchmarkAssets, initialAssets);
  const turnover = initialAssets > 0 ? grossNotional / initialAssets : 0;
  return {
    completed:counts.decisions, total:s.rounds.length, finished:replay.finished,
    initialAssets, currentAssets, benchmarkAssets, portfolioReturn, benchmarkReturn,
    relativeReturn:portfolioReturn - benchmarkReturn, maxDrawdown, benchmarkMaxDrawdown,
    totalFees:replay.fees, totalTaxes:replay.taxes??0, totalCosts:replay.totalCosts??replay.fees, cash:replay.cash, shares:replay.shares, holdingValue,
    receivables:replay.receivable ?? 0, dividends:replay.dividends ?? 0,
    currentExposure:percentage(holdingValue, currentAssets),
    meanExposure:counts.decisions ? points.slice(1).reduce((sum, point) => sum + point.exposure, 0) / counts.decisions : 0,
    grossNotional, turnover, turnoverPercent:turnover * 100, counts, points,
  };
}
