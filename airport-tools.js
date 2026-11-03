(function(root){
  "use strict";
  function present(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));}
  function n(value){return Number(value).toLocaleString("en-US",{maximumFractionDigits:2});}
  function weatherEnglish(value){
    if(!value) return "No present-weather group reported; this is not a statement that the route is hazard-free.";
    var names={MI:"shallow",PR:"partial",BC:"patches",DR:"low drifting",BL:"blowing",SH:"showers",TS:"thunderstorm",FZ:"freezing",DZ:"drizzle",RA:"rain",SN:"snow",SG:"snow grains",IC:"ice crystals",PL:"ice pellets",GR:"hail",GS:"small hail or snow pellets",UP:"unknown precipitation",BR:"mist",FG:"fog",FU:"smoke",VA:"volcanic ash",DU:"widespread dust",SA:"sand",HZ:"haze",PY:"spray",PO:"dust or sand whirls",SQ:"squalls",FC:"funnel cloud / tornado / waterspout",SS:"sandstorm",DS:"duststorm"};
    return String(value).trim().split(/\s+/).map(function(group){
      var original=group,prefix="";
      if(group[0]==="-"||group[0]==="+"){prefix=group[0]==="-"?"light ":"heavy ";group=group.slice(1);}
      if(group.startsWith("VC")){prefix+="in the vicinity: ";group=group.slice(2);}
      if(group==="NSW")return "No significant weather reported.";
      var tokens=group.match(/.{1,2}/g)||[];
      if(!tokens.length||tokens.some(function(t){return !names[t];}))return "Untranslated weather code: "+original;
      return prefix+tokens.map(function(t){return names[t];}).join(" ");
    }).join("; ");
  }
  function decode(p){
    var rows=[],raw=p.raw||"", add=function(field,reported,english){rows.push({field:field,reported:String(reported),english:english});};
    add("Reporting station",p.station||"Unknown","Weather observed at "+(p.station||"the reporting station")+"; not an area-wide forecast.");
    var observed=Date.parse(p.observed_at);
    add("Observation time",raw.match(/\b\d{6}Z\b/)?.[0]||p.observed_at||"Not reported",Number.isFinite(observed)?new Date(observed).toLocaleString("en-GB",{timeZone:"UTC",dateStyle:"medium",timeStyle:"short"})+" UTC (Zulu).":"Observation time is unavailable.");
    var categories={VFR:"Visual flight rules observation category",MVFR:"Marginal visual flight rules observation category",IFR:"Instrument flight rules observation category",LIFR:"Low instrument flight rules observation category"};
    add("Flight category",p.category||"Unknown",(categories[p.category]||"Category not reported")+". This does not determine whether a flight is safe or legal.");
    var wind=raw.match(/\b(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS|KMH)\b/);
    var direction=p.wind_direction, explanation="Wind not reported.";
    if(present(p.wind_speed_kt)){
      if(Number(p.wind_speed_kt)===0)explanation="Calm wind (0 knots).";
      else explanation=(direction==="VRB"||/\bVRB\d/.test(raw)?"Variable direction":present(direction)?"From "+n(direction)+"° true":"Direction not reported")+" at "+n(p.wind_speed_kt)+" knots"+(present(p.wind_gust_kt)?", gusting to "+n(p.wind_gust_kt)+" knots":"")+".";
    }
    add("Wind",wind?wind[0]:"Not reported",explanation);
    var variation=raw.match(/\b(\d{3})V(\d{3})\b/);
    if(variation)add("Variable wind sector",variation[0],"Wind direction varies between "+variation[1]+"° and "+variation[2]+"° true.");
    add("Visibility",p.visibility_sm?p.visibility_sm+" SM":"Not reported",p.visibility_sm?"Reported horizontal visibility: "+p.visibility_sm+" statute miles. A + suffix means greater than the stated value.":"Visibility is unavailable; it must not be assumed unrestricted.");
    add("Present weather",p.present_weather||"No group reported",weatherEnglish(p.present_weather));
    var covers={FEW:"Few clouds (1–2 eighths of the sky)",SCT:"Scattered clouds (3–4 eighths)",BKN:"Broken clouds (5–7 eighths)",OVC:"Overcast (8 eighths)",VV:"Vertical visibility into an obscuration",OVX:"Sky obscured",CLR:"No clouds detected within the automated sensor's reporting limits",SKC:"Sky clear as reported",NSC:"No significant clouds reported",NCD:"No clouds detected"};
    (p.clouds||[]).forEach(function(c,i){add("Cloud layer "+(i+1),c.cover+(present(c.base_agl_ft)?" · "+n(c.base_agl_ft)+" ft AGL":""),(covers[c.cover]||"Untranslated cloud cover: "+c.cover)+(present(c.base_agl_ft)?"; base "+n(c.base_agl_ft)+" feet above the reporting station.":"; no layer height reported."));});
    if(!(p.clouds||[]).length)add("Cloud layers","Not reported",/\bCAVOK\b/.test(raw)?"CAVOK reported. Refer to the original observation for this defined visibility/cloud/weather code.":"Cloud layers are unavailable; do not infer clear skies.");
    add("Lowest cloud base",present(p.cloud_base_agl_ft)?n(p.cloud_base_agl_ft)+" ft AGL":"Not reported",present(p.cloud_base_agl_ft)?"The lowest reported cloud base is "+n(p.cloud_base_agl_ft)+" feet above the station, including few or scattered layers.":"No numeric cloud base was supplied.");
    add("Ceiling",present(p.ceiling_agl_ft)?n(p.ceiling_agl_ft)+" ft AGL":"No numeric ceiling reported",present(p.ceiling_agl_ft)?"The lowest broken/overcast layer or vertical visibility is "+n(p.ceiling_agl_ft)+" feet above the station.":"No numeric broken/overcast/vertical-visibility ceiling is available. This is not an unlimited-ceiling guarantee.");
    add("Temperature",present(p.temperature_c)?n(p.temperature_c)+" °C":"Not reported",present(p.temperature_c)?"Air temperature is "+n(p.temperature_c)+" degrees Celsius.":"Air temperature not reported.");
    add("Dew point",present(p.dewpoint_c)?n(p.dewpoint_c)+" °C":"Not reported",present(p.dewpoint_c)?"Dew point is "+n(p.dewpoint_c)+" degrees Celsius.":"Dew point not reported.");
    add("Altimeter",present(p.altimeter_inhg)?Number(p.altimeter_inhg).toFixed(2)+" inHg":"Not reported",present(p.altimeter_inhg)?"Altimeter setting: "+Number(p.altimeter_inhg).toFixed(2)+" inches of mercury (approximately "+(Number(p.altimeter_inhg)*33.8639).toFixed(1)+" hPa).":"Altimeter setting not reported.");
    if(/\bAUTO\b/.test(raw))add("Report type","AUTO","Automated weather observation; some phenomena may not be detected.");
    if(/\bRMK\b/.test(raw))add("Remarks",raw.split(/\bRMK\b/).slice(1).join("RMK").trim(),"Original remarks are preserved here without automatic interpretation.");
    return rows;
  }
  function atcUrl(station){return 'https://www.liveatc.net/search/?icao='+encodeURIComponent(String(station||'').trim().toUpperCase());}
  if(typeof module!=="undefined"&&module.exports)module.exports={decode:decode,weatherEnglish:weatherEnglish,atcUrl:atcUrl};
  if(!root.document)return;
  var doc=root.document,dialog=doc.getElementById("airportDialog"),content=doc.getElementById("airportDialogContent"),picker=doc.getElementById("metarAirport"),station=doc.getElementById("metarStation");
  var plan=null,map=null,mode="metar",request=0,observer=null,drag=null;
  var main=doc.querySelector("main"),panel=doc.getElementById("weatherPanel"),handle=doc.getElementById("wxResize"),leftHandle=doc.getElementById("airportResize"),toggle=doc.getElementById("toggleWeather");
  var airportPanel=doc.getElementById("airportPanel"),trackToggle=doc.getElementById("toggleTrackMenu"),widthSlider=doc.getElementById("airportWidthSlider"),widthValue=doc.getElementById("airportWidthValue");
  var narrow=root.matchMedia("(max-width:860px)"),airportOpen=!narrow.matches;
  main.classList.toggle("airport-collapsed",!airportOpen);trackToggle.setAttribute("aria-expanded",String(airportOpen));airportPanel.inert=!airportOpen;
  var width=330,leftWidth=320;try{width=Number(localStorage.getItem("planner-weather-width"))||330;leftWidth=Number(localStorage.getItem("planner-airport-width"))||320;}catch(e){}
  function esc(s){return String(s??"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function airports(){return plan?[plan.from].concat(plan.diversions.map(function(d){return d.airport;}),[plan.to]).filter(function(a,i,all){return all.findIndex(function(x){return x.ident===a.ident;})===i;}):[];}
  function fillPicker(code){
    var list=airports();picker.innerHTML=list.map(function(a){return '<option value="'+esc(a.ident)+'">'+esc(a.ident+' · '+a.name)+'</option>';}).join("");
    if(!list.some(function(a){return a.ident===code;})){var option=doc.createElement("option");option.value=code;option.textContent=code;picker.appendChild(option);}
    picker.value=code;station.value=code;
  }
  async function show(){
    var code=station.value.trim().toUpperCase(),id=++request;
    if(!/^[A-Z0-9-]{2,8}$/.test(code)){content.innerHTML='<p class="airport-message">Enter a reporting station code such as KPHX.</p>';return;}
    station.value=code;picker.value=code;
    if(mode==="atc"){
      content.innerHTML='<section class="atc-launch"><div class="atc-icon" aria-hidden="true">◉</div><h3>'+esc(code)+' live ATC radio</h3><p>Open this airport’s LiveATC listing to choose available tower, ground, approach or ATIS feeds and start listening.</p><a class="atc-listen" href="'+esc(atcUrl(code))+'" target="_blank" rel="noopener">Open '+esc(code)+' on LiveATC ↗</a><p class="atc-note">LiveATC is an external service. Coverage, feed status and listening access vary by airport. No audio starts automatically.</p></section>';return;
    }
    content.innerHTML='<p class="airport-message">Loading '+esc(code)+' observation…</p>';
    try{
      var result=await root.PlannerWeather.getMetar(code);
      if(id!==request)return;
      if(!result.report){content.innerHTML='<p class="airport-message">'+(result.available?'No METAR for '+esc(code)+' is present in the latest published snapshot. This airport may not report METARs. Choose another reporting station; no nearby airport is substituted.':'The weather snapshot is unavailable. Refresh weather or use the official source.')+'</p><a class="airport-source" href="https://aviationweather.gov/data/metar/?id='+encodeURIComponent(code)+'" target="_blank" rel="noopener">Check '+esc(code)+' at NOAA/AWC ↗</a>';return;}
      var p=result.report,age=(Date.now()-Date.parse(p.observed_at))/60000;
      var old=result.stale||!Number.isFinite(age)||age>90||age < -10;
      var known=airports().find(function(a){return a.ident===code;});
      var rows=decode(p);
      content.innerHTML='<div class="metar-station"><div><h3>'+esc(code)+(known?' <span>'+esc(known.name)+'</span>':"")+'</h3><p>NOAA Aviation Weather Center · Heights are AGL; wind direction is true.</p></div><span class="metar-quality '+(old?'metar-old':'')+'">'+(old?'OLD / UNVERIFIED':'REPORTED OBSERVATION')+'</span></div>'+
      (old?'<p class="airport-message">This observation or its published snapshot is old/unverified. Check the official source before use.</p>':"")+
      '<section class="metar-raw"><h4>Original METAR</h4><pre>'+esc(p.raw||"Original report not supplied")+'</pre></section><div class="metar-table-wrap"><table class="metar-table"><thead><tr><th scope="col">Weather item</th><th scope="col">Reported value</th><th scope="col">Plain English</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><th scope="row">'+esc(r.field)+'</th><td>'+esc(r.reported)+'</td><td>'+esc(r.english)+'</td></tr>';}).join("")+'</tbody></table></div><p class="metar-footer">Simplified explanation of supported fields; untranslated remarks remain in the original report. <a href="https://aviationweather.gov/data/metar/?id='+encodeURIComponent(code)+'" target="_blank" rel="noopener">View official METAR ↗</a></p>';
    }catch(e){if(id===request)content.innerHTML='<p class="airport-message">METAR unavailable. Try refreshing the weather snapshot.</p>';}
  }
  function open(nextMode,code){
    mode=nextMode;code=code||(plan&&plan.from.ident)||"KPHX";fillPicker(code);
    doc.getElementById("airportDialogTitle").textContent=mode==="atc"?"Live airport radio":"METAR in plain English";
    doc.getElementById("airportDialogEyebrow").textContent=mode==="atc"?"LIVEATC · AIRPORT FEED DIRECTORY":"NOAA / AWC · AIRPORT OBSERVATION";
    doc.getElementById("loadMetar").textContent=mode==="atc"?"Find feeds":"Show";
    if(!dialog.open)dialog.showModal();show();
  }
  function resize(value,save){
    layout("right",value,save);
  }
  function resizeLeft(value,save){layout("left",value,save);}
  function layout(side,value,save){
    if(side==="left")leftWidth=value;else width=value;
    var available=Math.min(main.clientWidth,doc.documentElement.clientWidth),maxLeft=680,maxRight=620;
    if(available<=860){maxLeft=Math.max(260,Math.min(680,available-48));leftWidth=Math.min(maxLeft,Math.max(260,leftWidth));}
    if(available>860){
      if(side==="left"){
        width=Math.min(620,Math.max(260,width));
        maxLeft=Math.min(680,Math.max(260,available-320-(panel.hidden?0:width)));
        leftWidth=Math.min(maxLeft,Math.max(260,leftWidth));
        maxRight=Math.min(620,Math.max(260,available-(airportOpen?leftWidth:0)-320));
        width=Math.min(maxRight,width);
      }else{
        leftWidth=Math.min(680,Math.max(260,Math.min(leftWidth,available-320-(panel.hidden?0:260))));
        maxRight=Math.min(620,Math.max(260,available-(airportOpen?leftWidth:0)-320));
        width=Math.min(maxRight,Math.max(260,width));
        maxLeft=Math.min(680,Math.max(260,available-320-(panel.hidden?0:width)));
      }
    }
    main.style.setProperty("--weather-width",width+"px");main.style.setProperty("--airport-width",leftWidth+"px");
    handle.setAttribute("aria-valuenow",String(Math.round(width)));handle.setAttribute("aria-valuemax",String(Math.round(maxRight)));
    leftHandle.setAttribute("aria-valuenow",String(Math.round(leftWidth)));leftHandle.setAttribute("aria-valuemax",String(Math.round(maxLeft)));
    widthSlider.max=String(Math.round(maxLeft));widthSlider.value=String(Math.round(leftWidth));widthValue.textContent=Math.round(leftWidth)+" px";
    if(save)try{localStorage.setItem("planner-weather-width",String(width));localStorage.setItem("planner-airport-width",String(leftWidth));}catch(e){}
    if(map)requestAnimationFrame(function(){map.invalidateSize({pan:false,animate:false});});
  }
  resize(width,false);
  function openAirportMenu(value){airportOpen=value;main.classList.toggle("airport-collapsed",!value);trackToggle.setAttribute("aria-expanded",String(value));airportPanel.inert=!value;resize(width,false);if(!value)trackToggle.focus();}
  trackToggle.addEventListener("click",function(){openAirportMenu(!airportOpen);});
  doc.getElementById("closeTrackMenu").addEventListener("click",function(){openAirportMenu(false);});
  widthSlider.addEventListener("input",function(){resizeLeft(Number(widthSlider.value),true);});
  doc.getElementById("expandTrackMenu").addEventListener("click",function(){resizeLeft(Number(widthSlider.max),true);});
  narrow.addEventListener("change",function(){openAirportMenu(!narrow.matches);});
  doc.addEventListener("keydown",function(e){if(e.key==="Escape"&&narrow.matches&&airportOpen&&!dialog.open)openAirportMenu(false);});
  doc.getElementById("openMetar").addEventListener("click",function(){open("metar");});
  doc.getElementById("openAtc").addEventListener("click",function(){open("atc");});
  doc.getElementById("closeAirportDialog").addEventListener("click",function(){dialog.close();});
  dialog.addEventListener("close",function(){request++;});
  dialog.addEventListener("click",function(e){if(e.target===dialog){var b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  picker.addEventListener("change",function(){station.value=picker.value;show();});
  doc.getElementById("loadMetar").addEventListener("click",show);
  station.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();show();}});
  doc.addEventListener("click",function(e){var button=e.target.closest("[data-airport-metar]");if(button)open("metar",button.dataset.airportMetar);});
  toggle.addEventListener("click",function(){panel.hidden=!panel.hidden;main.classList.toggle("weather-collapsed",panel.hidden);toggle.textContent=panel.hidden?"Show weather":"Hide weather";toggle.setAttribute("aria-expanded",String(!panel.hidden));resize(width,false);});
  function startDrag(e,side,grip){if(e.button!==0)return;e.preventDefault();e.stopPropagation();drag={pointer:e.pointerId,side:side,restore:!!(map&&map.dragging.enabled())};grip.setPointerCapture(e.pointerId);if(drag.restore)map.dragging.disable();main.classList.add("weather-resizing");}
  function moveDrag(e){if(drag&&e.pointerId===drag.pointer){var bounds=main.getBoundingClientRect();if(drag.side==="left")resizeLeft(e.clientX-bounds.left,true);else resize(bounds.right-e.clientX,true);}}
  handle.addEventListener("pointerdown",function(e){startDrag(e,"right",handle);});
  leftHandle.addEventListener("pointerdown",function(e){startDrag(e,"left",leftHandle);});
  handle.addEventListener("pointermove",moveDrag);leftHandle.addEventListener("pointermove",moveDrag);
  function stop(e){if(!drag||e.pointerId!==drag.pointer)return;if(drag.restore&&map)map.dragging.enable();drag=null;main.classList.remove("weather-resizing");}
  handle.addEventListener("pointerup",stop);handle.addEventListener("pointercancel",stop);handle.addEventListener("lostpointercapture",stop);
  leftHandle.addEventListener("pointerup",stop);leftHandle.addEventListener("pointercancel",stop);leftHandle.addEventListener("lostpointercapture",stop);
  handle.addEventListener("dblclick",function(){resize(330,true);});
  handle.addEventListener("keydown",function(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();resize(e.key==="Home"?260:e.key==="End"?620:width+(e.key==="ArrowLeft"?30:-30),true);});
  leftHandle.addEventListener("dblclick",function(){resizeLeft(320,true);});
  leftHandle.addEventListener("keydown",function(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();resizeLeft(e.key==="Home"?260:e.key==="End"?680:leftWidth+(e.key==="ArrowRight"?30:-30),true);});
  root.addEventListener("resize",function(){resize(width,false);});
  root.AirportTools={setRoute:function(nextMap,nextPlan){map=nextMap;plan=nextPlan;if(map&&!observer){observer=new ResizeObserver(function(){map.invalidateSize({pan:false,animate:false});});observer.observe(doc.getElementById("map"));}if(dialog.open){fillPicker(station.value||(plan&&plan.from.ident)||"KPHX");show();}resize(width,false);}};
})(typeof window!=="undefined"?window:globalThis);
