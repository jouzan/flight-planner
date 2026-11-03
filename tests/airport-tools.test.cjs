const test=require('node:test');const assert=require('node:assert/strict');
const tools=require('../airport-tools.js');
const rows=p=>Object.fromEntries(tools.decode(p).map(r=>[r.field,r]));
test('cloud base and ceiling are explained separately with AGL units',()=>{
  const r=rows({cloud_base_agl_ft:500,ceiling_agl_ft:1200,clouds:[{cover:'FEW',base_agl_ft:500},{cover:'BKN',base_agl_ft:1200}]});
  assert.match(r['Lowest cloud base'].english,/500 feet above/);assert.match(r.Ceiling.english,/1,200 feet above/);
});
test('missing temperatures, winds and ceilings are not decoded as zero or clear',()=>{
  const r=rows({});assert.equal(r.Temperature.reported,'Not reported');assert.equal(r.Wind.english,'Wind not reported.');assert.match(r.Ceiling.english,/not an unlimited-ceiling/);
});
test('zero temperature and calm winds are real data',()=>{
  const r=rows({temperature_c:0,dewpoint_c:0,wind_speed_kt:0,wind_direction:'0',raw:'00000KT'});assert.equal(r.Temperature.reported,'0 °C');assert.equal(r.Wind.english,'Calm wind (0 knots).');
});
test('variable and gusting wind is decoded without inventing a direction',()=>{
  const r=rows({wind_speed_kt:12,wind_gust_kt:20,wind_direction:'VRB',raw:'VRB12G20KT'});assert.match(r.Wind.english,/Variable direction at 12 knots, gusting to 20 knots/);
});
test('weather groups translate known codes and preserve unsupported codes',()=>{
  assert.match(tools.weatherEnglish('-FZRA BR'),/light freezing rain; mist/);assert.match(tools.weatherEnglish('VCSH'),/vicinity: showers/);assert.equal(tools.weatherEnglish('XYZ'),'Untranslated weather code: XYZ');
});
test('CLR respects the reporting limits and unknown cloud heights stay unknown',()=>{
  const r=rows({clouds:[{cover:'CLR',base_agl_ft:null}]});assert.match(r['Cloud layer 1'].english,/sensor.*reporting limits/);assert.doesNotMatch(r['Cloud layer 1'].reported,/0 ft/);
});
test('raw remarks are preserved without pretending to fully translate them',()=>{
  const r=rows({raw:'KPHX 022351Z RMK AO2 SLP123'});assert.equal(r.Remarks.reported,'AO2 SLP123');assert.match(r.Remarks.english,/without automatic interpretation/);
});
