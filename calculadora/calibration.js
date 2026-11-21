(function(root){
  function interpolate(points,x,mode='log'){
    const sorted=points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).sort((a,b)=>a[0]-b[0]);
    if(!sorted.length||x<sorted[0][0]||x>sorted[sorted.length-1][0])return null;
    const exact=sorted.find(p=>p[0]===x);if(exact)return exact[1];
    for(let i=1;i<sorted.length;i++)if(x<sorted[i][0]){
      const [x0,y0]=sorted[i-1],[x1,y1]=sorted[i],ratio=(x-x0)/(x1-x0);
      return mode==='linear'
        ? y0+(y1-y0)*ratio
        : Math.exp(Math.log(y0)+(Math.log(y1)-Math.log(y0))*ratio);
    }
    return null;
  }
  root.lookupInterpolate=function(model,p){
    if(!model?.lookup)return null;
    const wantedSmoker=p.smoker==='smoker'?1:0,byAge=new Map();
    for(const [key,premium] of Object.entries(model.lookup)){
      const [age,toAge,life,ci,smoker]=key.split('|').map(Number);
      if(smoker!==wantedSmoker||ci!==p.ci||!Number.isFinite(premium)||premium<=0)continue;
      if(!byAge.has(age))byAge.set(age,new Map());
      const byToAge=byAge.get(age);if(!byToAge.has(toAge))byToAge.set(toAge,[]);
      byToAge.get(toAge).push([life,premium]);
    }
    const agePoints=[];
    for(const [age,byToAge] of byAge){
      const termPoints=[];
      for(const [toAge,capitalPoints] of byToAge){
        const premium=interpolate(capitalPoints,p.life,'linear');if(premium!=null)termPoints.push([toAge,premium]);
      }
      const premium=interpolate(termPoints,p.toAge);if(premium!=null)agePoints.push([age,premium]);
    }
    return interpolate(agePoints,p.age);
  };
  root.quoteRange=function(model,main,{outside=false,directLookup=false}={}){
    const spread=directLookup
      ? main*(model?.strictlyValidated?0.2:0.35)
      : Math.max(
          model?.residualQ90||0,
          main*(outside||!model?.strictlyValidated?0.35:0.2),
        );
    return {low:Math.max(0,main-spread),high:main+spread};
  };
})(globalThis);
