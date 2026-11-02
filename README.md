# Flight planner

A-to-B VFR diversion planner with a map, airport information, winds, traffic and
a right-side government aviation weather panel.

## Government weather

- **Cloud bases and ceilings:** NOAA/AWC METAR observations. Lowest cloud base
  includes FEW/SCT layers; ceiling uses BKN/OVC or vertical visibility. Heights
  are feet **AGL**, never silently converted to MSL. Missing values stay unknown.
- **SIGMET:** domestic and international advisories, including convective weather.
- **PIREP/AIREP:** pilot observations, including reported icing and turbulence.
- **Icing / turbulence:** reported conditions and G-AIRMET forecasts. Forecast
  valid times and altitude bands are displayed separately from observations.
  A freezing-level line alone is not represented as icing.
- **NWS alerts:** US surface warnings and advisories with published polygons.

Weather is selected within approximately 100 NM of the route, at all altitudes.
Advisories up to six hours ahead are labeled as forecasts. Area geometry is
used for selection; a large polygon containing the route is not missed because
its centroid or vertices are far away. Pins represent observations, points within
advisory areas, or their nearest boundaries—not the precise position of a storm.

Red glowing points indicate IFR/LIFR METARs, positive icing reports,
moderate-or-greater turbulence / urgent PIREPs, SIGMETs, relevant G-AIRMETs,
and severe/extreme NWS alerts or warnings. This is report classification,
not an aircraft-specific risk assessment or route clearance. Colors also have
text labels; animations respect reduced-motion preferences.

### Sources and publishing

1. NOAA Aviation Weather Center: https://aviationweather.gov/data/api/
   Official cache feeds for METAR, PIREP/AIREP, SIGMET, and G-AIRMET.
2. NOAA National Weather Service: https://www.weather.gov/documentation/services-web-api
   Active NWS alerts from https://api.weather.gov/alerts/active.

AWC does not allow browser cross-origin API requests. A GitHub Actions workflow
retrieves government feeds server-side and deploys the site and its JSON snapshot
using GitHub Pages. It uses only the repository's built-in token for publishing;
no weather API keys, third-party CORS relays or new cloud services are required.
The existing airport, wind, and traffic sources remain unchanged.

The workflow runs on main updates, manual dispatch and approximately every 15
minutes. GitHub can delay scheduled runs. Browsers check for a new snapshot every
five minutes; Refresh retrieves the latest published snapshot, not a direct
upstream observation. Source retrieval times and individual report times are shown.

Snapshots over 35 minutes old hide weather layers and show a stale-data warning.
METAR observations over 90 minutes old do not glow as current hazards; observations
over three hours and PIREPs over two hours are excluded. Expired advisories are
excluded. Feed failures show incomplete coverage rather than an all-clear. NWS
alerts lacking polygons remain counted as unmapped; no locations are fabricated.
The workflow publishes explicit feed failure information if an upstream is down.

Worldwide METAR/SIGMET coverage varies. PIREPs are primarily US/North Atlantic;
G-AIRMET coverage is CONUS; NWS alerts are US surface products. Missing reports
never establish the absence of hazards. Use an official briefing before flight.

## Airport METARs, radio and panel sizing

Each airport card has a **METAR / English** button and an airport-specific
**LiveATC** link. Map toolbar buttons open the same airport tools. The METAR
window shows the untouched original report plus a table explaining supported
fields: observation time, flight category, wind/gusts, visibility, present weather,
cloud layers, base/ceiling, temperature/dew point and altimeter setting. Remarks
and unknown codes stay visible without invented translations. Pick another route
airport or enter a reporting-station ICAO. No nearby station is silently substituted
if an airport has no METAR. Old observations/snapshots are marked unverified.

LiveATC opens the selected airport's external feed directory in a new tab.
Feed availability and listening access depend on LiveATC; this app does not scrape,
embed, rehost, authenticate to or automatically play its audio streams.

Drag the divider between map and weather panel to resize it, or focus the divider
and use the arrow keys. Double-click resets its width. Width is remembered locally;
**Hide weather / Show weather** maximizes or restores the map. On narrow screens
the weather panel stacks below the map instead of squeezing it.

## Local development

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/weather.test.cjs
node --test tests/airport-tools.test.cjs
python3 scripts/collect_weather.py
python3 -m http.server 8767
```

Open http://localhost:8767. The generated weather-data folder is deliberately
excluded from Git; deployed snapshots are produced during each Pages build.
