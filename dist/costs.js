// Teaching cost models. Rates are explicit scenario data, not a claim about any broker's bill.
export const ETF_V1_COST_MODEL = Object.freeze({version:'tw-etf-v1',feeRate:0.001,minimumCommission:0,sellTaxRate:0.001,rounding:'floor-twd'});
export const DEFAULT_COST_MODEL = Object.freeze({version:'tw-equity-v2',mode:'auto',assetClass:'etf',instrumentType:'etf',baseRate:0.001425,discount:1,feeRate:0.001425,minimumCommission:1,sellTaxRate:0.001,rounding:'floor-twd',orderType:'simplified-odd-lot'});
export const LEGACY_COST_MODEL = Object.freeze({version:'legacy-0.1%-no-tax',feeRate:0.001,minimumCommission:0,sellTaxRate:0,rounding:'none'});
function normalizeEquityModel(input) {
  const mode=input.mode===undefined?'auto':input.mode,assetClass=input.assetClass!==undefined?input.assetClass:input.instrumentType!==undefined?input.instrumentType:(mode==='stock'?'stock':'etf');
  if(!['auto','etf','stock'].includes(mode)||!['etf','stock'].includes(assetClass))throw Error('交易成本商品類型設定不正確');
  if(mode!=='auto'&&mode!==assetClass)throw Error('選擇的商品類型與實際標的不符，請選自動或正確類型');
  if(input.instrumentType!==undefined&&input.instrumentType!==assetClass)throw Error('成本模型商品類型不一致');
  const baseRate=.001425,discount=input.discount===undefined?1:input.discount,minimumCommission=input.minimumCommission===undefined?1:input.minimumCommission,sellTaxRate=assetClass==='stock'?.003:.001;
  if(typeof discount!=='number'||!Number.isFinite(discount)||discount<0||discount>1)throw Error('手續費折扣須介於 0 與 1');
  if(!Number.isSafeInteger(minimumCommission)||minimumCommission<0)throw Error('最低手續費須為非負整數');
  const [bn,bd]=decimal(baseRate),[dn,dd]=decimal(discount),feeRate=Number(bn*dn)/Number(bd*dd);
  for(const [key,value] of Object.entries({baseRate,feeRate,sellTaxRate,rounding:'floor-twd',orderType:'simplified-odd-lot'}))if(input[key]!==undefined&&input[key]!==value)throw Error('成本模型的基準費率、有效費率、稅率或取整規則不一致');
  return {version:'tw-equity-v2',mode,assetClass,instrumentType:assetClass,baseRate,discount,feeRate,minimumCommission,sellTaxRate,rounding:'floor-twd',orderType:'simplified-odd-lot'};
}
export const TAX_CORRECTION_COST_VERSION='tw-legacy-tax-v1';
function normalizeTaxCorrection(input){
  const assetClass=input.assetClass??input.instrumentType;
  if(!['etf','stock'].includes(assetClass))throw Error('補稅模型缺少可驗證的商品類型');
  const expected={version:TAX_CORRECTION_COST_VERSION,assetClass,instrumentType:assetClass,feeRate:.001,minimumCommission:0,sellTaxRate:assetClass==='stock'?.003:.001,rounding:'none',taxRounding:'floor-twd'};
  for(const [key,value] of Object.entries(expected))if(input[key]!==undefined&&input[key]!==value)throw Error('補稅模型必須保留原 0.1% 未取整手續費及正確賣出稅率');
  return expected;
}
export function normalizeCostModel(input = DEFAULT_COST_MODEL) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('交易成本設定格式不正確');
  if(input.version==='tw-equity-v2')return normalizeEquityModel(input);
  if(input.version===TAX_CORRECTION_COST_VERSION)return normalizeTaxCorrection(input);
  const legacy = input.version === LEGACY_COST_MODEL.version;
  if (!legacy && input.version !== ETF_V1_COST_MODEL.version) throw Error('不支援的交易成本模型');
  const result = {...(legacy ? LEGACY_COST_MODEL : ETF_V1_COST_MODEL), ...input};
  if (typeof result.feeRate !== 'number' || !Number.isFinite(result.feeRate) || result.feeRate < 0 || result.feeRate > 1) throw Error('手續費率須介於 0 與 1');
  if (!Number.isSafeInteger(result.minimumCommission) || result.minimumCommission < 0) throw Error('最低手續費須為非負整數');
  if (result.rounding !== (legacy ? 'none' : 'floor-twd') || result.sellTaxRate !== (legacy ? 0 : .001) || legacy && result.minimumCommission !== 0) throw Error('交易成本模型的稅率或取整規則不正確');
  return {version:result.version,feeRate:result.feeRate,minimumCommission:result.minimumCommission,sellTaxRate:result.sellTaxRate,rounding:result.rounding};
}
export function resolveCostModel(input = DEFAULT_COST_MODEL, assetClass = 'etf') {
  if(!['etf','stock'].includes(assetClass))throw Error('歷史資料商品類型不支援');
  const model=normalizeCostModel(input);
  if(model.version===TAX_CORRECTION_COST_VERSION){if(model.assetClass!==assetClass)throw Error('補稅商品類型與實際標的不符');return model;}
  if(model.version!=='tw-equity-v2')return model;
  if(model.mode!=='auto'&&model.mode!==assetClass)throw Error(`選擇的${model.mode==='stock'?'股票':'ETF'}類型與實際${assetClass==='stock'?'股票':'ETF'}標的不符，請選自動或正確類型`);
  return {...model,assetClass,instrumentType:assetClass,sellTaxRate:assetClass==='stock'?.003:.001};
}
export function modelFor(s) {
  return s?.costModel ? normalizeCostModel(s.costModel) : normalizeCostModel({...LEGACY_COST_MODEL,feeRate:s?.feeRate ?? .001});
}
// Convert the finite decimal spelling (including exponent notation) to an exact rational.
function decimal(value) {
  const [coefficient, exponent='0'] = String(value).toLowerCase().split('e');
  const [whole, fraction=''] = coefficient.split('.');
  let numerator = BigInt(whole + fraction), scale = fraction.length - Number(exponent);
  if (scale < 0) { numerator *= 10n ** BigInt(-scale); scale = 0; }
  return [numerator, 10n ** BigInt(scale)];
}
export function transactionCosts(s, side, quantity, price) {
  if (!['buy','sell','hold'].includes(side)) throw Error('無效的交易方向');
  if (side === 'hold' || quantity === 0) return {amount:0,fee:0,tax:0,totalCost:0,cashFlow:0};
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price <= 0) throw Error('成交價格或單位數不正確');
  const model = modelFor(s); let amount,fee,tax;
  if (model.version === LEGACY_COST_MODEL.version) { amount=quantity*price;fee=amount*model.feeRate;tax=0; }
  else if(model.version===TAX_CORRECTION_COST_VERSION){
    amount=quantity*price;fee=amount*model.feeRate;const [pn,pd]=decimal(price),[tn,td]=decimal(model.sellTaxRate);tax=side==='sell'?Number(pn*BigInt(quantity)*tn/(pd*td)):0;
  }
  else {
    const [pn,pd]=decimal(price),[tn,td]=decimal(model.sellTaxRate),notional=pn*BigInt(quantity);
    let [fn,fd]=decimal(model.feeRate);if(model.version==='tw-equity-v2'){const [bn,bd]=decimal(model.baseRate),[dn,dd]=decimal(model.discount);fn=bn*dn;fd=bd*dd;}
    amount=Number(notional)/Number(pd);
    fee=Math.max(model.minimumCommission,Number(notional*fn/(pd*fd)));
    tax=side==='sell'?Number(notional*tn/(pd*td)):0;
  }
  const totalCost=fee+tax;
  if (![amount,fee,tax,totalCost].every(Number.isFinite)) throw Error('成交金額超出可計算範圍');
  return {amount,fee,tax,totalCost,cashFlow:side==='buy'?-(amount+totalCost):model.version===TAX_CORRECTION_COST_VERSION?amount-fee-tax:amount-totalCost};
}
export function maxAffordableQuantity(s,cash,price) {
  if (!Number.isFinite(cash)||cash<=0||!Number.isFinite(price)||price<=0) return 0;
  const model=modelFor(s);
  if(model.version===LEGACY_COST_MODEL.version||model.version===TAX_CORRECTION_COST_VERSION)return Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(cash/(price*(1+model.feeRate)))));
  const [cn,cd]=decimal(cash),[pn,pd]=decimal(price);
  let low=0,high=Number((cn*pd/(cd*pn))>BigInt(Number.MAX_SAFE_INTEGER)?BigInt(Number.MAX_SAFE_INTEGER):(cn*pd/(cd*pn)));
  while(low<high){const mid=low+Math.ceil((high-low)/2);if(-transactionCosts(s,'buy',mid,price).cashFlow<=cash)low=mid;else high=mid-1;}
  return low;
}
