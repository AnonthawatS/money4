class Range { constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++){row.push((this.sh.d[this.r-1+i]||[])[this.c-1+j] ?? '');}o.push(row);}return o;}
  setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{const R=this.r-1+i;this.sh.d[R]=this.sh.d[R]||[];this.sh.d[R][this.c-1+j]=x;}));return this;}
  setValue(x){return this.setValues([[x]]);} setFontWeight(){return this;} setNumberFormat(){return this;} }
class Sheet { constructor(n){this.n=n;this.d=[];}
  getRange(r,c,nr=1,nc=1){ return new Range(this,r,c,nr,nc);}
  getLastRow(){return this.d.length;} getLastColumn(){return Math.max(0,...this.d.map(r=>r.length));} getMaxRows(){return 1000;}
  getDataRange(){return new Range(this,1,1,Math.max(1,this.d.length),Math.max(1,this.getLastColumn()));}
  appendRow(a){this.d.push(a.slice());} deleteRow(r){this.d.splice(r-1,1);} setFrozenRows(){} }
const sheets={};
global.SpreadsheetApp={getActiveSpreadsheet:()=>({setSpreadsheetTimeZone(){},getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n))})};
const P={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>P[k]??null,setProperty:(k,v)=>{P[k]=v}})};
global.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
global.Logger={log:()=>{}};
global.Utilities={getUuid:()=>'abcd-efgh-1234',formatDate:(d,tz,f)=>{const p=n=>String(n).padStart(2,'0');const s=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;return f==='yyyy-MM'?s.slice(0,7):f==='d'?String(d.getDate()):s;}};
global.ContentService={createTextOutput:t=>({setMimeType(){return t;}}),MimeType:{JSON:1}};
