import fs from 'node:fs';
import '../calibration.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/models.json',import.meta.url),'utf8'));
const model=catalog.models.life_only;
const quote=(age,toAge,life)=>globalThis.lookupInterpolate(model,{age,toAge,life,ci:0,smoker:'non-smoker'});
const checks=[
  ['exact anchor',quote(60,75,50000),23.37,23.37],
  ['capital interpolation',quote(60,75,40000),14.82,23.37],
  ['age interpolation',quote(57,75,50000),15.97,23.37],
  ['term interpolation',quote(60,72,50000),20.00,23.37],
];
const failures=checks.filter(([,actual,min,max])=>!Number.isFinite(actual)||actual<min-0.001||actual>max+0.001);
const combined=catalog.models['life_plus_standalone_ci:standard_core_ci'];
const directRange=globalThis.quoteRange(combined,11.25,{directLookup:true});
if(Math.abs(directRange.low-9)>0.001||Math.abs(directRange.high-13.5)>0.001){
  failures.push(['direct lookup range',directRange,9,13.5]);
}
if(failures.length){console.error(JSON.stringify({ok:false,failures},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,checks:[...checks.map(([name,value])=>({name,value:Number(value.toFixed(4))})),{name:'direct lookup range',low:directRange.low,high:directRange.high}]},null,2));
