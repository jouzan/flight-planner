(function(root){
  "use strict";
  var NM = 3440.065, D = Math.PI / 180, CORRIDOR = 100;
  function numeric(n){ return n !== null && n !== "" && n !== undefined && Number.isFinite(Number(n)); }
  function time(value){ var n = Date.parse(value); return Number.isFinite(n) ? n : null; }
  function age(value, now){ var t = time(value); return t === null ? Infinity : (now - t) / 60000; }
  function wrap(n){ return ((n + 540) % 360) - 180; }
  function distance(a, b){
    var h = Math.sin((a[1]-b[1])*D/2)**2 + Math.cos(a[1]*D)*Math.cos(b[1]*D)*Math.sin(wrap(a[0]-b[0])*D/2)**2;
    return 2*NM*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
  }
  function routePoints(route){
    var a=[route.from.lon,route.from.lat], b=[route.to.lon,route.to.lat];
    var count=Math.max(1,Math.ceil(distance(a,b)/15)), points=[];
    // Spherical interpolation follows the route across the antimeridian, too.
    var v=function(p){return [Math.cos(p[1]*D)*Math.cos(p[0]*D),Math.cos(p[1]*D)*Math.sin(p[0]*D),Math.sin(p[1]*D)];};
    var va=v(a), vb=v(b), angle=Math.acos(Math.max(-1,Math.min(1,va.reduce(function(s,x,i){return s+x*vb[i];},0))));
    for(var i=0;i<=count;i++){
      var f=i/count;
      if(angle<1e-8 || Math.abs(Math.sin(angle))<1e-8){points.push([a[0]+wrap(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);continue;}
      var p=va.map(function(x,j){return (Math.sin((1-f)*angle)*x+Math.sin(f*angle)*vb[j])/Math.sin(angle);});
      points.push([Math.atan2(p[1],p[0])/D,Math.atan2(p[2],Math.hypot(p[0],p[1]))/D]);
    }
    return points;
  }
  function inRing(point, ring){
    var x=point[0], y=point[1], inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=x+wrap(ring[i][0]-x), xj=x+wrap(ring[j][0]-x), yi=ring[i][1], yj=ring[j][1];
      if(((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  }
  function inPolygon(p, rings){ return rings.length && inRing(p,rings[0]) && !rings.slice(1).some(function(r){return inRing(p,r);}); }
  function segmentDistance(p,a,b){
    var scale=Math.cos(p[1]*D), ax=wrap(a[0]-p[0])*scale*60, ay=(a[1]-p[1])*60;
    var bx=wrap(b[0]-p[0])*scale*60, by=(b[1]-p[1])*60, dx=bx-ax,dy=by-ay;
    var t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(ax+t*dx,ay+t*dy);
  }
  function nearRoute(geometry, points, width){
    if(!geometry) return false;
    if(geometry.type==="Point") return points.some(function(p){return distance(p,geometry.coordinates)<=width+8;});
    var polygons=geometry.type==="Polygon"?[geometry.coordinates]:geometry.type==="MultiPolygon"?geometry.coordinates:[];
    return polygons.some(function(rings){
      if(points.some(function(p){return inPolygon(p,rings);})) return true;
      return rings.some(function(r){return r.some(function(a,i){var b=r[(i+1)%r.length];return points.some(function(p){return segmentDistance(p,a,b)<=width;});});});
    });
  }
  function relevant(feature, now){
    var p=feature.properties || {};
    if(p.kind==="metar") return age(p.observed_at,now)>=-10 && age(p.observed_at,now)<=180;
    if(p.kind==="pirep") return age(p.observed_at,now)>=-10 && age(p.observed_at,now)<=120;
    var end=time(p.valid_to);
    if(end===null || end<=now) return false;
    if(p.kind==="gairmet"){var valid=time(p.forecast_at);return valid!==null && valid>=now-3*3600000 && valid<=now+6*3600000;}
    var start=time(p.valid_from);
    return start!==null && start<=now+6*3600000;
  }
  function current(feature, now){
    var p=feature.properties;
    if(p.kind==="metar") return age(p.observed_at,now)<=90;
    if(p.kind==="pirep") return age(p.observed_at,now)<=120;
    if(p.kind==="gairmet") return false; // Valid-time forecasts are never relabeled as observations.
    return time(p.valid_from)<=now && time(p.valid_to)>now;
  }
  function select(data,route,now){
    var points=routePoints(route);
    return (data.features||[]).filter(function(f){return relevant(f,now) && nearRoute(f.geometry,points,CORRIDOR);});
  }
  function hazard(feature, now){return !!feature.properties.hazardous && !(feature.properties.kind==="metar" && !current(feature,now));}
  function anchor(feature, route){
    var geometry=feature.geometry;
    if(geometry.type==="Point") return geometry.coordinates;
    var polygons=geometry.type==="Polygon"?[geometry.coordinates]:geometry.coordinates, points=routePoints(route);
    for(var k=0;k<points.length;k++) if(polygons.some(function(r){return inPolygon(points[k],r);})) return points[k];
    var best=polygons[0][0][0], nearest=Infinity;
    polygons.forEach(function(rings){rings[0].forEach(function(a,i){
      var b=rings[0][(i+1)%rings[0].length];
      points.forEach(function(p){
        var scale=Math.max(.001,Math.cos(p[1]*D)), ax=wrap(a[0]-p[0])*scale,ay=a[1]-p[1];
        var dx=wrap(b[0]-a[0])*scale,dy=b[1]-a[1];
        var t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
        var q=[wrap(a[0]+t*wrap(b[0]-a[0])),a[1]+t*dy],d=distance(p,q);
        if(d<nearest){nearest=d;best=q;}
      });
    });});
    return best;
  }
  var Core={age:age,time:time,distance:distance,routePoints:routePoints,nearRoute:nearRoute,relevant:relevant,current:current,select:select,hazard:hazard,anchor:anchor};
  if(typeof module!=="undefined" && module.exports) module.exports=Core;
  if(!root.document) return;
  var SOURCE_NAMES=["metars","pireps","sigmets","gairmets","nws"];
  var doc=root.document, data=null, route=null, map=null, layers=[], selected=[], chosen="all", loading=null, timer=null;
  var status=doc.getElementById("wxStatus"), cards=doc.getElementById("wxCards"), refresh=doc.getElementById("wxRefresh");
  function esc(value){return String(value===null || value===undefined?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function utc(value){var n=time(value);return n===null?"Time not supplied":new Date(n).toLocaleString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false})+" UTC";}
  function feet(value){return numeric(value)?Number(value).toLocaleString("en-US")+" ft":"Not reported";}
  function minutes(value){var a=age(value,Date.now());return Number.isFinite(a)?Math.max(0,Math.floor(a))+" min ago":"Age unknown";}
  function stale(){return !data || age(data.generated_at,Date.now())>35 || age(data.generated_at,Date.now()) < -10;}
  function usable(source){return data && data.sources[source] && data.sources[source].ok && age(data.sources[source].fetched_at,Date.now())<=35;}
  function category(f){
    var p=f.properties;
    if(p.kind==="metar") return "clouds";
    if(p.kind==="sigmet") return "sigmets";
    if(p.kind==="pirep") return "pireps";
    if(p.kind==="nws") return "alerts";
    return p.hazard==="ICE"?"ice":/TURB|LLWS/.test(p.hazard)?"turbulence":"clouds";
  }
  function matches(f){
    if(chosen==="all") return true;
    var p=f.properties;
    if(chosen==="ice") return category(f)==="ice" || p.has_ice || p.hazard==="ICE";
    if(chosen==="turbulence") return category(f)==="turbulence" || p.has_turbulence || /TURB|MTW/.test(p.hazard||"");
    return category(f)===chosen;
  }
  function label(p){
    if(p.kind==="metar") return (p.category||"UNKNOWN") + (age(p.observed_at,Date.now())>90?" · OLD":"");
    if(p.kind==="pirep") return p.urgent?"URGENT PIREP":"OBSERVATION";
    if(p.kind==="gairmet" || time(p.valid_from)>Date.now()) return "FORECAST";
    return "ACTIVE";
  }
  function heights(p){
    var base=p.base_msl_ft, top=p.top_msl_ft;
    return (base==="FZL"?"Freezing level":feet(base)) + " to " + feet(top) + " MSL";
  }
  function summary(p){
    if(p.kind==="metar"){
      var hasClear=(p.clouds||[]).some(function(c){return /^(CLR|SKC|NSC|NCD)$/.test(c.cover);});
      return '<div class="wx-clouds"><div><span>Lowest cloud base</span><strong>'+esc(numeric(p.cloud_base_agl_ft)?feet(p.cloud_base_agl_ft):hasClear?"None reported":"Not reported")+'</strong><small>AGL</small></div>'+
        '<div><span>Ceiling</span><strong>'+esc(numeric(p.ceiling_agl_ft)?feet(p.ceiling_agl_ft):"None reported")+'</strong><small>AGL · BKN / OVC / VV</small></div></div>'+
        '<p>Visibility '+esc(p.visibility_sm||"not reported")+' SM · '+esc(utc(p.observed_at))+'</p>';
    }
    if(p.kind==="pirep"){
      var ice=(p.icing||[]).map(function(i){return [i.icing_intensity,i.icing_type].filter(Boolean).join(" ");}).join(", ");
      var turb=(p.turbulence||[]).map(function(t){return t.turbulence_intensity||"Not reported";}).join(", ");
      return '<p>'+esc(feet(p.altitude_msl_ft))+' MSL · '+esc(utc(p.observed_at))+'</p><p>Icing: '+esc(ice||"Not reported")+' · Turbulence: '+esc(turb||"Not reported")+'</p>';
    }
    if(p.kind==="gairmet") return '<p>Forecast valid '+esc(utc(p.forecast_at))+'</p><p>'+esc(heights(p))+' · '+esc(p.severity||"Advisory")+'</p>';
    if(p.kind==="sigmet") return '<p>'+esc(heights(p))+'</p><p>'+esc(utc(p.valid_from))+' → '+esc(utc(p.valid_to))+'</p>';
    return '<p>'+esc(p.severity||"Severity unknown")+' · '+esc(p.area||"")+'</p><p>Until '+esc(utc(p.valid_to))+'</p>';
  }
  function popup(f){var p=f.properties;return '<div class="wx-popup"><b>'+esc(p.title)+'</b>'+summary(p)+'<pre>'+esc(p.raw||"No raw text supplied")+'</pre></div>';}
  function clear(){if(map) layers.forEach(function(l){map.removeLayer(l);});layers=[];}
  function add(layer){layers.push(layer);layer.addTo(map);}
  function center(f){
    var position=anchor(f,route);return [position[1],position[0]];
  }
  function draw(){
    clear();if(!map || stale()) return;
    selected.filter(matches).filter(function(f){return usable(f.properties.source);}).slice(0,180).forEach(function(f){
      var p=f.properties, bad=hazard(f,Date.now()), future=!current(f,Date.now()) && p.kind!=="metar";
      var color=bad?"#dc2946":p.kind==="metar"&&p.category==="VFR"?"#19866a":"#aa680a";
      if(f.geometry.type!=="Point") add(L.geoJSON(f,{pane:"weatherAreas",style:{color:color,weight:2,fillOpacity:.08,dashArray:future?"6 6":null}}).bindPopup(popup(f)));
      var icon=p.kind==="metar"?p.category==="UNKNOWN"?"?":p.category:p.kind==="pirep"?"P":p.kind==="sigmet"?"S":p.kind==="nws"?"!":p.hazard==="ICE"?"I":"T";
      var marker=L.marker(center(f),{pane:"weatherMarkers",icon:L.divIcon({className:"wx-marker",html:'<span class="wx-dot '+(bad?"wx-hazard":"wx-caution")+'" style="--wx-color:'+color+'">'+esc(icon)+'</span>',iconSize:[32,32],iconAnchor:[16,16]})}).bindPopup(popup(f));
      marker.bindTooltip(esc(p.title)+" · "+esc(label(p)),{direction:"top",offset:[0,-18]});
      add(marker);
    });
  }
  function render(){
    if(!route || !data) return;
    var now=Date.now();selected=select(data,route,now);
    var failures=SOURCE_NAMES.filter(function(k){return !usable(k);});
    var isStale=stale(), badCount=selected.filter(function(f){return hazard(f,now)&&usable(f.properties.source);}).length;
    status.className="wx-status"+(isStale||failures.length?" wx-status-warn":"");
    status.textContent=isStale?"Weather snapshot is stale. Refresh or check official sources; map weather hidden.":failures.length?"Some feeds unavailable: "+failures.join(", ")+". Coverage is incomplete.":"Official feeds retrieved "+minutes(data.generated_at)+". Reports have individual validity times.";
    doc.getElementById("wxUpdated").textContent="Published "+utc(data.generated_at);
    doc.getElementById("wxHazards").textContent=isStale?"Data stale":badCount+" hazard report"+(badCount===1?"":"s");
    doc.getElementById("wxScope").textContent=route.from.ident+" → "+route.to.ident+" · within 100 NM · all altitudes";
    doc.getElementById("wxSources").innerHTML=SOURCE_NAMES.map(function(k){var s=data.sources[k]||{url:"https://aviationweather.gov/"};return '<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(k.toUpperCase())+'</a><span class="'+(usable(k)?"wx-feed-ok":"wx-feed-bad")+'">'+(usable(k)?"Fetched":"Unavailable / old")+'</span>';}).join("");
    var unmapped=Object.keys(data.sources).reduce(function(n,k){return n+(data.sources[k].unmapped_count||0);},0);
    doc.getElementById("wxCoverage").textContent="METARs & SIGMETs: worldwide. PIREPs: mainly US / North Atlantic. G-AIRMETs: CONUS. NWS: US surface alerts. "+unmapped+" feed reports lack mapped areas and are not placed on the map. No reports does not mean no hazards.";
    doc.querySelectorAll("[data-wx-filter]").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.wxFilter===chosen));});
    var shown=selected.filter(matches).sort(function(a,b){
      var bad=Number(hazard(b,now))-Number(hazard(a,now));
      if(bad) return bad;
      if(a.geometry.type==="Point"&&b.geometry.type==="Point") return distance(a.geometry.coordinates,[route.from.lon,route.from.lat])-distance(b.geometry.coordinates,[route.from.lon,route.from.lat]);
      return 0;
    });
    if(!shown.length){cards.innerHTML='<div class="wx-empty"><b>'+(isStale||failures.length?"Weather coverage incomplete":"No matching reports in this corridor")+'</b><p>Try another category or check the official sources. This is not an all-clear.</p></div>';}
    else cards.innerHTML=shown.slice(0,40).map(function(f){var p=f.properties, bad=hazard(f,now), old=isStale||!usable(p.source)||p.kind==="metar"&&!current(f,now);return '<article class="wx-card '+(bad&&!old?"wx-card-hazard":"")+'"><div class="wx-card-top"><span class="wx-kind">'+esc(p.kind.toUpperCase())+'</span><span class="wx-tag '+(bad&&!old?"wx-tag-danger":"")+'">'+esc(old?"OLD / UNVERIFIED":label(p))+'</span></div><button type="button" class="wx-report-title" data-wx-report="'+esc(p.id)+'">'+esc(p.title)+'</button>'+summary(p)+'<details><summary>Original government report</summary><pre>'+esc(p.raw||"No raw text supplied")+'</pre></details></article>';}).join("")+(shown.length>40?'<p class="wx-footnote">Showing 40 of '+shown.length+' matching reports. Choose a category to narrow the list.</p>':"");
    draw();
  }
  function update(){
    if(loading) return loading;
    refresh.disabled=true;status.textContent="Retrieving official weather snapshot…";
    loading=fetch("weather-data/weather.json?t="+Math.floor(Date.now()/300000),{cache:"no-store",signal:AbortSignal.timeout(20000)}).then(function(r){if(!r.ok)throw new Error("Snapshot unavailable");return r.json();}).then(function(value){
      if(value.version!==1||!value.sources||!Array.isArray(value.features)||time(value.generated_at)===null)throw new Error("Invalid snapshot");
      data=value;render();
    }).catch(function(){
      data=null;clear();cards.innerHTML='<div class="wx-empty"><b>Weather data unavailable</b><p>The official snapshot could not be retrieved. Use the source links below; missing data is not clear weather.</p></div>';
      status.className="wx-status wx-status-warn";status.textContent="Weather refresh failed. No weather markers are displayed.";
      doc.getElementById("wxHazards").textContent="Unavailable";
      doc.getElementById("wxUpdated").textContent="No current snapshot";
      doc.getElementById("wxSources").innerHTML='<a href="https://aviationweather.gov/" target="_blank" rel="noopener">NOAA Aviation Weather Center</a><a href="https://www.weather.gov/" target="_blank" rel="noopener">National Weather Service</a>';
    }).finally(function(){refresh.disabled=false;loading=null;});
    return loading;
  }
  doc.querySelectorAll("[data-wx-filter]").forEach(function(b){b.addEventListener("click",function(){chosen=b.dataset.wxFilter;render();});});
  cards.addEventListener("click",function(e){var button=e.target.closest("[data-wx-report]");if(!button||!map||stale())return;var feature=selected.find(function(f){return f.properties.id===button.dataset.wxReport;});if(feature){map.setView(center(feature),Math.max(6,map.getZoom()));L.popup().setLatLng(center(feature)).setContent(popup(feature)).openOn(map);}});
  refresh.addEventListener("click",update);
  root.PlannerWeather={setRoute:function(nextMap,nextRoute){
    clear();map=nextMap;route=nextRoute;
    if(!route){cards.innerHTML='<div class="wx-empty">Plan a valid route to see nearby reports.</div>';doc.getElementById("wxScope").textContent="No route selected";doc.getElementById("wxHazards").textContent="No route";return;}
    if(!map.getPane("weatherAreas")){map.createPane("weatherAreas").style.zIndex=360;map.createPane("weatherMarkers").style.zIndex=460;}
    if(data)render();else update();
    if(!timer){timer=setInterval(update,300000);setInterval(function(){if(data)render();},60000);}
  }};
})(typeof window!=="undefined"?window:globalThis);
