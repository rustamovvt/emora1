const buckets=new Map();
export function allowRate(key,{limit=60,windowMs=60_000}={}){
  const now=Date.now();
  let b=buckets.get(key);
  if(!b || now-b.start>=windowMs){ b={start:now,count:0}; buckets.set(key,b); }
  b.count++;
  if(buckets.size>5000){ for(const [k,v] of buckets) if(now-v.start>windowMs*2) buckets.delete(k); }
  return b.count<=limit;
}
