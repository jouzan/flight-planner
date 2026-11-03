const test=require('node:test');const assert=require('node:assert/strict');
const live=require('../weather-live.js');const core=require('../weather.js');
const now=Date.parse('2026-11-03T02:00:00Z');
function sample(extra={}){return {geometry:{type:'Point',coordinates:[-112,33]},properties:{timestamp:'2026-11-03T01:50:00Z',cloudLayers:[{amount:'CLR',base:{unitCode:'wmoUnit:m',value:3810}}],visibility:{unitCode:'wmoUnit:m',value:null},...extra}};}
test('NWS CLR sensor height is not a cloud base; null visibility is not zero',()=>{
 const f=live.observation(sample(),'KPHX',now);assert.equal(f.properties.cloud_base_agl_ft,null);assert.equal(f.properties.visibility_sm,null);assert.equal(f.properties.kind,'observation');assert.equal(f.properties.hazardous,false);
});
test('NWS ceiling uses BKN/OVC, not scattered clouds; meters convert to feet',()=>{
 const f=live.observation(sample({cloudLayers:[{amount:'SCT',base:{unitCode:'wmoUnit:m',value:100}},{amount:'BKN',base:{unitCode:'wmoUnit:m',value:300}}],visibility:{unitCode:'wmoUnit:m',value:0}}),'KPHX',now);
 assert.ok(Math.abs(f.properties.cloud_base_agl_ft-328.084)<0.01);assert.ok(Math.abs(f.properties.ceiling_agl_ft-984.252)<0.01);assert.equal(f.properties.visibility_sm,'0.0');
});
test('old, future and missing timestamps or coordinates never become current observations',()=>{
 assert.equal(live.observation(sample({timestamp:'2026-11-02T20:00:00Z'}),'KPHX',now),null);
 assert.equal(live.observation(sample({timestamp:null}),'KPHX',now),null);
 assert.equal(live.observation({...sample(),geometry:null},'KPHX',now),null);
 const f=live.observation(sample(),'KPHX',now);assert.equal(core.relevant(f,now+90*60000),false);
});
test('partial alert collections are rejected, surface warnings keep original validity',()=>{
 assert.throws(()=>live.alerts({features:[],pagination:{next:'more'}}),/Incomplete/);
 const f=live.alerts({features:[{id:'x',geometry:null,properties:{event:'Flood Warning',onset:'2026-11-03T01:00:00Z',ends:'2026-11-03T03:00:00Z'}}]})[0];
 assert.equal(f.properties.hazardous,true);assert.equal(f.geometry,null);assert.equal(f.properties.valid_to,'2026-11-03T03:00:00Z');
});
