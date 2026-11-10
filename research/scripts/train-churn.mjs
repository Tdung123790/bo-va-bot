import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openZip,readCsv} from './data-utils.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const features=['tenure_days','recency_days','frequency_orders','orders_last_90d','orders_prev_90d','trend_90d','monetary_total','avg_order_value'];
const zip=await openZip(path.join(root,'research/input/Bo_Bot_data.zip'));
const rows=[];
const source='ml_churn_training_asof_2026_07_01.csv';
const parsed=readCsv(zip,source,row=>{
 assert.equal(row.as_of_date,'2026-07-01');
 assert.ok(row.churn_60d==='0'||row.churn_60d==='1');
 const values=features.map(column=>Number(row[column]));
 assert.ok(values.every(Number.isFinite),'CHURN_NON_NUMERIC_FEATURE');
 rows.push({x:values,y:Number(row.churn_60d)});
});
assert.equal(parsed.count,8500);
assert.ok(features.every(column=>parsed.columns.includes(column)));
assert.ok(!features.some(column=>['customer_id','as_of_date','prediction_horizon_days','churn_60d','future_product_ids'].includes(column)));
function random(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
const rng=random(42),groups=[[],[]];
for(const row of rows)groups[row.y].push(row);
for(const group of groups){for(let i=group.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[group[i],group[j]]=[group[j],group[i]];}}
const test=groups.flatMap(group=>group.slice(0,Math.round(group.length*.25)));
const train=groups.flatMap(group=>group.slice(Math.round(group.length*.25)));
assert.equal(train.length+test.length,8500);
const mean=features.map((_,index)=>train.reduce((sum,row)=>sum+row.x[index],0)/train.length);
const scale=features.map((_,index)=>Math.sqrt(train.reduce((sum,row)=>sum+(row.x[index]-mean[index])**2,0)/train.length)||1);
const normalized=row=>row.x.map((value,index)=>(value-mean[index])/scale[index]);
const training=train.map(row=>({x:normalized(row),y:row.y}));
const testing=test.map(row=>({x:normalized(row),y:row.y}));
const weights=Array(features.length+1).fill(0),momentum=weights.map(()=>0),velocity=weights.map(()=>0);
const sigmoid=value=>1/(1+Math.exp(-Math.max(-40,Math.min(40,value))));
for(let epoch=1;epoch<=650;epoch++){
 const gradient=weights.map(()=>0);
 for(const row of training){
  const probability=sigmoid(weights[0]+row.x.reduce((sum,value,index)=>sum+value*weights[index+1],0));
  const error=probability-row.y;
  gradient[0]+=error;
  for(let index=0;index<row.x.length;index++)gradient[index+1]+=error*row.x[index];
 }
 for(let index=0;index<weights.length;index++){
  const value=gradient[index]/training.length+(index===0?0:.003*weights[index]);
  momentum[index]=.9*momentum[index]+.1*value;
  velocity[index]=.999*velocity[index]+.001*value*value;
  const m=momentum[index]/(1-.9**epoch),v=velocity[index]/(1-.999**epoch);
  weights[index]-=.05*m/(Math.sqrt(v)+1e-8);
 }
}
const scores=testing.map(row=>({score:sigmoid(weights[0]+row.x.reduce((sum,value,index)=>sum+value*weights[index+1],0)),label:row.y}));
const matrix=[[0,0],[0,0]];
for(const row of scores)matrix[row.label][row.score>=.5?1:0]++;
const [[tn,fp],[fn,tp]]=matrix;
const precision=tp/(tp+fp)||0,recall=tp/(tp+fn)||0;
const ranked=[...scores].sort((a,b)=>b.score-a.score);
let found=0,averagePrecision=0;
for(let index=0;index<ranked.length;index++)if(ranked[index].label===1){found++;averagePrecision+=found/(index+1);}
averagePrecision/=tp+fn;
const negatives=tn+fp;
let negativesBelow=0,aucPairs=0;
for(const row of [...scores].sort((a,b)=>a.score-b.score)){
 if(row.label===0)negativesBelow++;
 else aucPairs+=negativesBelow;
}
const metrics={confusion_matrix:matrix,accuracy:(tp+tn)/scores.length,precision_churn:precision,recall_churn:recall,f1_churn:precision+recall?2*precision*recall/(precision+recall):0,roc_auc:aucPairs/((tp+fn)*negatives),pr_auc:averagePrecision};
const metadata={label:'SYNTHETIC_RESEARCH_ONLY',model_version:'synthetic-logit-2026-07-01-v1',model_type:'logistic_regression_adam_baseline',source:`Bo_Bot_data.zip/${source}`,as_of_date:'2026-07-01',split:'75/25 stratified by churn_60d',random_state:42,features,excluded:['customer_id','as_of_date','prediction_horizon_days','churn_60d','future_product_ids'],train_rows:train.length,holdout_rows:test.length,epochs:650,l2:0.003,decision_threshold:0.5,metrics,benchmark_from_supplied_synthetic_holdout:{model:'HistGradientBoostingClassifier',roc_auc:0.8884,pr_auc:0.7252},warning:'Synthetic research performance only; not validated for real customers'};
const model={label:metadata.label,model_version:metadata.model_version,model_type:metadata.model_type,features,mean,scale,weights,decision_threshold:.5};
await fs.mkdir(path.join(root,'research/output'),{recursive:true});
await fs.writeFile(path.join(root,'research/output/churn-metrics.synthetic.json'),JSON.stringify(metadata,null,2)+'\n');
await fs.writeFile(path.join(root,'research/output/churn-model.synthetic.json'),JSON.stringify(model,null,2)+'\n');
console.log(`PASS synthetic Churn baseline: train=${train.length}, holdout=${test.length}, ROC-AUC=${metrics.roc_auc.toFixed(4)}, PR-AUC=${metrics.pr_auc.toFixed(4)}, F1=${metrics.f1_churn.toFixed(4)}`);
