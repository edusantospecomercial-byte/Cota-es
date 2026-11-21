import fs from 'node:fs';
import '../calibration.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/models.json',import.meta.url),'utf8'));
const model=catalog.models.life_only;
const quote=(age,toAge,life)=>globalThis.lookupInterpolate(model,{age,toAge,life,ci:0,smoker:'non-smoker'});
const checks=[
  ['exact anchor',quote(60,75,50000),23.37,23.37],
  ['capital interpolation',quote(60,75,40000),19.095,19.095],
  ['age interpolation',quote(57,75,50000),20.7112,20.7112],
  ['term interpolation',quote(60,72,50000),21.2854,21.2854],
];
const failures=checks.filter(([,actual,min,max])=>!Number.isFinite(actual)||actual<min-0.001||actual>max+0.001);
const combined=catalog.models['life_plus_standalone_ci:standard_core_ci'];
const directRange=globalThis.quoteRange(combined,11.25,{directLookup:true});
if(Math.abs(directRange.low-9)>0.001||Math.abs(directRange.high-13.5)>0.001){
  failures.push(['direct lookup range',directRange,9,13.5]);
}
const outsideRange=globalThis.quoteRange(combined,20,{outside:true});
const outsideSpread=Math.max(20-outsideRange.low,outsideRange.high-20)/20;
if(outsideRange.low<0||outsideSpread<0.35-0.001){
  failures.push(['outside range margin',outsideRange,'minimum spread',0.35]);
}
const aggregateRange=globalThis.quoteRange(model,20,{directLookup:true});
const aggregateSpread=Math.max(20-aggregateRange.low,aggregateRange.high-20)/20;
if(aggregateRange.low<0||aggregateSpread<0.35-0.001){
  failures.push(['aggregate range margin',aggregateRange,'minimum spread',0.35]);
}
if(failures.length){console.error(JSON.stringify({ok:false,failures},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,checks:[...checks.map(([name,value])=>({name,value:Number(value.toFixed(4))})),{name:'direct lookup range',low:directRange.low,high:directRange.high},{name:'outside range margin',low:outsideRange.low,high:outsideRange.high,spread:Number(outsideSpread.toFixed(4))},{name:'aggregate range margin',low:aggregateRange.low,high:aggregateRange.high,spread:Number(aggregateSpread.toFixed(4))}]},null,2));
