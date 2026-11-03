/* Direct government fallback. NWS observations/alerts are distinct from AWC aviation products. */
(function(root){
 'use strict';
 function number(n){return typeof n==='number'&&Number.isFinite(n)?n:null;}
 function quantity(q,unit){return q&&q.unitCode===unit&&q.qualityControl!=='Z'?number(q.value):null;}
 function feet(q){var n=quantity(q,'wmoUnit:m');return n===null?null:n*3.28084;}
 function observation(item,station,now){
  var p=item&&item.properties,g=item&&item.geometry,t=Date.parse(p&&p.timestamp);
  if(!p||!g||g.type!=='Point'||!Array.isArray(g.coordinates)||g.coordinates.length!==2||!g.coordinates.every(n=>number(n)!==null)||Math.abs(g.coordinates[0])>180||Math.abs(g.coordinates[1])>90||!Number.isFinite(t)||now-t>90*60000||now-t < -10*60000)return null;
  var clouds=(p.cloudLayers||[]).filter(c=>/^(FEW|SCT|BKN|OVC|VV)$/.test(c.amount)).map(c=>({cover:c.amount,base_agl_ft:feet(c.base)}));
  var bases=clouds.map(c=>c.base_agl_ft).filter(n=>n!==null),ceilings=clouds.filter(c=>/^(BKN|OVC|VV)$/.test(c.cover)).map(c=>c.base_agl_ft).filter(n=>n!==null);
  var visibility=quantity(p.visibility,'wmoUnit:m');
  return {type:'Feature',geometry:g,properties:{id:'nws-observation-'+station,kind:'observation',source:'nws_observations',station:station,title:station+' · NWS observation',observed_at:p.timestamp,clouds:clouds,cloud_base_agl_ft:bases.length?Math.min(...bases):null,ceiling_agl_ft:ceilings.length?Math.min(...ceilings):null,visibility_sm:visibility===null?null:(visibility/1609.344).toFixed(1),raw:p.rawMessage||p.textDescription||'No raw report supplied',hazardous:false}};
 }
 function alerts(data){
  if(!data||!Array.isArray(data.features)||data.pagination&&data.pagination.next)throw new Error('Incomplete NWS alerts');
  return data.features.map(item=>{var p=item.properties||{};return {type:'Feature',geometry:item.geometry,properties:{id:item.id||p.id,kind:'nws',source:'nws',title:p.event||'NWS alert',issued_at:p.sent,valid_from:p.onset||p.effective,valid_to:p.ends||p.expires,severity:p.severity,area:p.areaDesc,raw:(p.headline||'')+'\n'+(p.description||''),hazardous:['Extreme','Severe'].includes(p.severity)||/Warning/.test(p.event||'')}};});
 }
 var cached=null,inflight=null;
 async function load(route,nearby){
  var candidates=[route.from.ident,route.to.ident].concat(nearby.map(f=>f.properties.station)).filter(s=>/^(K[A-Z0-9]{3}|P[A-Z0-9]{3}|T[IJ][A-Z0-9]{2})$/.test(s));
  candidates=Array.from(new Set(candidates));
  var stations=candidates.slice(0,2),rest=candidates.slice(2);
  for(var i=0;i<Math.min(10,rest.length);i++)stations.push(rest[Math.floor(i*rest.length/Math.min(10,rest.length))]);
  stations=Array.from(new Set(stations));
  var key=stations.join(',');
  if(cached&&cached.key===key&&Date.now()-cached.time<300000)return cached.value;
  if(inflight){await inflight;return load(route,nearby);}
  async function get(url){var r=await fetch(url,{headers:{Accept:'application/geo+json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('NWS HTTP '+r.status);return r.json();}
  inflight=(async function(){
   var sources={},features=[],now=new Date().toISOString();
   var results=await Promise.allSettled([get('https://api.weather.gov/alerts/active?status=actual&message_type=alert,update').then(alerts),...stations.map(s=>get('https://api.weather.gov/stations/'+s+'/observations/latest').then(d=>observation(d,s,Date.now())))]);
   var alarm=results[0];
   sources.nws={provider:'NWS direct API',url:'https://www.weather.gov/',ok:alarm.status==='fulfilled',fetched_at:alarm.status==='fulfilled'?now:null};
   if(alarm.status==='fulfilled'){features.push(...alarm.value);sources.nws.unmapped_count=alarm.value.filter(f=>!f.geometry).length;}
   var observations=results.slice(1).filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
   features.push(...observations);
   sources.nws_observations={provider:'NWS direct station observations',url:'https://www.weather.gov/documentation/services-web-api',ok:observations.length>0,fetched_at:observations.length?now:null,count:observations.length,requested:stations.length};
   cached={key:key,time:Date.now(),value:{sources:sources,features:features}};
   return cached.value;
  })().finally(()=>{inflight=null;});
  return inflight;
 }
 var api={observation:observation,alerts:alerts,load:load};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.WeatherLive=api;
})(typeof window==='object'?window:globalThis);
