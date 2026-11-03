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
test('LiveATC link targets the selected airport and encodes its input',()=>{
  assert.equal(tools.atcUrl(' kphx '),'https://www.liveatc.net/search/?icao=KPHX');assert.equal(new URL(tools.atcUrl('KPHX&evil=1')).searchParams.size,1);
});
test('only checked tower players receive direct player links, never invented airport mounts',()=>{
  const phx=tools.towerPlayers('KPHX'),las=tools.towerPlayers('klas');
  assert.equal(phx[0].url,'https://www.liveatc.net/hlisten.php?mount=kphx_twr_both&icao=kphx');
  assert.equal(las[0].url,'https://www.liveatc.net/hlisten.php?mount=klas4_twr&icao=klas');
  assert.deepEqual(tools.towerPlayers('US-2648'),[]);
  assert(phx.every(p=>p.name.startsWith('Tower')));
});
test('radio table places all tower channels first and excludes invalid frequencies',()=>{
  const rows=tools.radioRows([{type:'ATIS',mhz:127.575},{type:'TWR',mhz:120.9},{type:'GND',mhz:119.75},{type:'TWR',mhz:118.7},{type:'TWR',mhz:null}]);
  assert.deepEqual(rows.slice(0,2).map(f=>f.mhz),[118.7,120.9]);assert.equal(rows.length,4);
});
