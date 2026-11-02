const test=require('node:test');
const assert=require('node:assert/strict');
const wx=require('../weather.js');
const now=Date.parse('2026-11-02T23:30:00Z');
const route={from:{lat:33,lon:-112},to:{lat:36,lon:-115}};
const feature=(p,g)=>({properties:p,geometry:g||{type:'Point',coordinates:[-112,33]}});
test('expiry and unknown validity never become active hazards',()=>{
  assert.equal(wx.relevant(feature({kind:'sigmet',valid_from:'2026-11-02T20:00:00Z',valid_to:'2026-11-02T23:29:00Z'}),now),false);
  assert.equal(wx.relevant(feature({kind:'sigmet'}),now),false);
});
test('stale METAR cannot glow as a current hazard',()=>{
  const f=feature({kind:'metar',observed_at:'2026-11-02T21:30:00Z',hazardous:true});
  assert.equal(wx.relevant(f,now),true);
  assert.equal(wx.hazard(f,now),false);
  assert.equal(wx.current(f,now),false);
});
test('old PIREPs are excluded',()=>{
  assert.equal(wx.relevant(feature({kind:'pirep',observed_at:'2026-11-02T20:00:00Z'}),now),false);
});
test('G-AIRMET forecast remains a forecast and future horizon is bounded',()=>{
  let f=feature({kind:'gairmet',forecast_at:'2026-11-03T03:00:00Z',valid_to:'2026-11-03T06:00:00Z'});
  assert.equal(wx.relevant(f,now),true);assert.equal(wx.current(f,now),false);
  f.properties.forecast_at='2026-11-03T09:00:00Z';assert.equal(wx.relevant(f,now),false);
});
test('large polygon containing route is selected despite distant vertices',()=>{
  const geometry={type:'Polygon',coordinates:[[[-130,20],[-90,20],[-90,50],[-130,50],[-130,20]]]};
  assert.equal(wx.nearRoute(geometry,wx.routePoints(route),100),true);
  const pin=wx.anchor(feature({},geometry),route);
  assert(wx.distance(pin,[-112,33])<0.00001);
});
test('hazard pin uses nearby boundary rather than a distant polygon vertex',()=>{
  const geometry={type:'Polygon',coordinates:[[[-111,10],[-80,10],[-80,60],[-111,60],[-111,10]]]};
  const p=wx.anchor(feature({},geometry),route);
  assert.equal(p[0],-111);
  assert(p[1]>=33-1e-8 && p[1]<=36+1e-8);
});
test('polygon with a hole does not include a route wholly in the hole',()=>{
  const geometry={type:'Polygon',coordinates:[[[-140,10],[-80,10],[-80,60],[-140,60],[-140,10]],[[-130,20],[-100,20],[-100,50],[-130,50],[-130,20]]]};
  assert.equal(wx.nearRoute(geometry,wx.routePoints(route),20),false);
});
test('nearby boundary of large area is retained and distant points omitted',()=>{
  assert.equal(wx.nearRoute({type:'Point',coordinates:[-75,40]},wx.routePoints(route),100),false);
  const geometry={type:'Polygon',coordinates:[[[-114,34],[-90,34],[-90,50],[-114,50],[-114,34]]]};
  assert.equal(wx.nearRoute(geometry,wx.routePoints(route),100),true);
});
test('antimeridian route takes short path',()=>{
  const points=wx.routePoints({from:{lat:50,lon:179},to:{lat:50,lon:-179}});
  assert(points.every(p=>Math.abs(p[0])>178));
  assert.equal(wx.nearRoute({type:'Point',coordinates:[180,50]},points,100),true);
});
test('missing coordinates and missing timestamps cannot imply conditions',()=>{
  assert.equal(wx.nearRoute(null,wx.routePoints(route),100),false);
  assert.equal(wx.age(null,now),Infinity);
});
