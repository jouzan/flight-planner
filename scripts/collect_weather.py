"""Retrieve public NOAA/NWS feeds for same-origin GitHub Pages delivery.

No credentials, commercial relays, or fabricated fallback weather are used.
Each product records its own fetch outcome. Missing data never means clear skies.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

AWC = 'https://aviationweather.gov'
FEEDS = {
    'metars': (AWC + '/data/cache/metars.cache.xml.gz', 'NOAA Aviation Weather Center', AWC + '/data/metar/'),
    'pireps': (AWC + '/data/cache/aircraftreports.cache.xml.gz', 'NOAA Aviation Weather Center', AWC + '/data/pirep/'),
    'sigmets': (AWC + '/data/cache/sigmets.cache.json.gz', 'NOAA Aviation Weather Center', AWC + '/gfa/#sigmet'),
    'gairmets': (AWC + '/data/cache/gairmets.cache.xml.gz', 'NOAA Aviation Weather Center', AWC + '/gfa/#gairmet'),
    'nws': ('https://api.weather.gov/alerts/active?status=actual&message_type=alert,update',
            'NOAA National Weather Service', 'https://www.weather.gov/'),
}


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def text(el, name):
    return el.findtext(name) or ''


def iso(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    return value or None


def point(lat, lon):
    lat, lon = number(lat), number(lon)
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {'type': 'Point', 'coordinates': [lon, lat]}


def polygon(coords):
    clean = []
    for lon, lat in coords:
        p = point(lat, lon)
        if p:
            clean.append(p['coordinates'])
    if len(clean) < 3:
        return None
    if clean[0] != clean[-1]:
        clean.append(clean[0])
    return {'type': 'Polygon', 'coordinates': [clean]}


def feature(properties, geometry):
    properties['id'] = hashlib.sha256(json.dumps([properties, geometry], sort_keys=True).encode()).hexdigest()[:20]
    return {'type': 'Feature', 'geometry': geometry, 'properties': properties}


def metars(raw):
    records = []
    for el in ET.fromstring(raw).iter('METAR'):
        geometry = point(text(el, 'latitude'), text(el, 'longitude'))
        if not geometry:
            continue
        clouds = [{'cover': c.get('sky_cover'), 'base_agl_ft': number(c.get('cloud_base_ft_agl'))}
                  for c in el.findall('sky_condition')]
        bases = [c['base_agl_ft'] for c in clouds if c['base_agl_ft'] is not None and c['cover'] not in {'CLR', 'SKC', 'NSC', 'NCD'}]
        ceilings = [c['base_agl_ft'] for c in clouds if c['cover'] in {'BKN', 'OVC', 'OVX', 'VV'} and c['base_agl_ft'] is not None]
        vv = number(text(el, 'vert_vis_ft'))
        if vv is not None:
            ceilings.append(vv)
        category = text(el, 'flight_category') or 'UNKNOWN'
        records.append(feature({
            'kind': 'metar', 'source': 'metars', 'station': text(el, 'station_id'),
            'observed_at': text(el, 'observation_time'), 'category': category,
            'clouds': clouds, 'cloud_base_agl_ft': min(bases) if bases else None,
            'ceiling_agl_ft': min(ceilings) if ceilings else None,
            'vertical_visibility_ft': vv, 'visibility_sm': text(el, 'visibility_statute_mi'),
            'wind_direction': text(el, 'wind_dir_degrees'), 'wind_speed_kt': number(text(el, 'wind_speed_kt')),
            'wind_gust_kt': number(text(el, 'wind_gust_kt')), 'temperature_c': number(text(el, 'temp_c')),
            'dewpoint_c': number(text(el, 'dewpoint_c')), 'altimeter_inhg': number(text(el, 'altim_in_hg')),
            'present_weather': text(el, 'wx_string'),
            'raw': text(el, 'raw_text'), 'hazardous': category in {'IFR', 'LIFR'},
            'title': text(el, 'station_id') + ' · ' + category,
        }, geometry))
    return records


def pireps(raw):
    records = []
    for el in ET.fromstring(raw).iter('AircraftReport'):
        geometry = point(text(el, 'latitude'), text(el, 'longitude'))
        if not geometry:
            continue
        icing = [dict(c.attrib) for c in el.findall('icing_condition')]
        turb = [dict(c.attrib) for c in el.findall('turbulence_condition')]
        has_ice = any(c.get('icing_intensity') not in {None, '', 'NEG', 'NONE', 'NIL'} for c in icing)
        has_turb = any(c.get('turbulence_intensity') not in {None, '', 'NEG', 'NONE', 'NIL'} for c in turb)
        significant_turb = any(any(s in c.get('turbulence_intensity', '') for s in ['MOD', 'SEV', 'EXTRM']) for c in turb)
        urgent = ' UUA ' in (' ' + text(el, 'raw_text') + ' ')
        records.append(feature({
            'kind': 'pirep', 'source': 'pireps', 'observed_at': text(el, 'observation_time'),
            'altitude_msl_ft': number(text(el, 'altitude_ft_msl')),
            'icing': icing, 'turbulence': turb, 'has_ice': has_ice, 'has_turbulence': has_turb,
            'urgent': urgent, 'hazardous': has_ice or significant_turb or urgent,
            'title': ('Urgent ' if urgent else '') + (text(el, 'report_type') or 'PIREP/AIREP'),
            'raw': text(el, 'raw_text'),
        }, geometry))
    return records


def sigmets(raw):
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError('Unexpected SIGMET cache format')
    records = []
    for item in data:
        def area(points):
            coords = []
            for p in points:
                if not isinstance(p, dict):
                    continue
                lon = number(p.get('lon'))
                if lon is not None and lon > 180:
                    lon -= 360
                coords.append((lon, p.get('lat')))
            return polygon(coords)
        geometry = None
        if item.get('geom') == 'AREA':
            geometry = area(item.get('coords') or [])
        elif item.get('geom') == 'AREAS':
            areas = [area(points) for points in (item.get('coords') or [])]
            coordinates = [a['coordinates'] for a in areas if a]
            if coordinates:
                geometry = {'type': 'MultiPolygon', 'coordinates': coordinates}
        # A point/line advisory is not expanded into an invented hazard area.
        if item.get('geom') not in {'AREA', 'AREAS'}:
            geometry = None
        records.append(feature({
            'kind': 'sigmet', 'source': 'sigmets', 'hazard': item.get('hazard', ''),
            'title': 'SIGMET ' + str(item.get('seriesId') or '') + ' · ' + str(item.get('hazard') or 'Hazard'),
            'issued_at': iso(item.get('issueTime')), 'valid_from': iso(item.get('validTimeFrom')),
            'valid_to': iso(item.get('validTimeTo')), 'base_msl_ft': item.get('base'), 'top_msl_ft': item.get('top'),
            'raw': item.get('rawSigmet') or '', 'hazardous': True,
        }, geometry))
    return records


def gairmets(raw):
    records = []
    for el in ET.fromstring(raw).iter('GAIRMET'):
        hazard = el.find('hazard')
        if hazard is None or hazard.get('type') not in {'ICE', 'TURB-HI', 'TURB-LO', 'LLWS', 'IFR', 'MT_OBSC', 'SFC_WND'}:
            continue
        if text(el, 'geometry_type') != 'AREA':
            continue
        alt = el.find('altitude')
        code = hazard.get('type')
        coords = [(text(p, 'longitude'), text(p, 'latitude')) for p in el.findall('./area/point')]
        records.append(feature({
            'kind': 'gairmet', 'source': 'gairmets', 'hazard': code, 'severity': hazard.get('severity') or '',
            'title': 'G-AIRMET · ' + code, 'issued_at': text(el, 'issue_time'),
            'forecast_at': text(el, 'valid_time'), 'valid_to': text(el, 'expire_time'),
            'base_msl_ft': alt.get('min_ft_msl') if alt is not None else None,
            'top_msl_ft': alt.get('max_ft_msl') if alt is not None else None,
            'raw': ' '.join(el.itertext()), 'hazardous': True,
        }, polygon(coords)))
    return records


def nws(raw):
    data = json.loads(raw)
    if not isinstance(data.get('features'), list) or data.get('pagination', {}).get('next'):
        raise ValueError('Incomplete NWS alert collection')
    records = []
    for item in data['features']:
        p = item.get('properties') or {}
        records.append(feature({
            'kind': 'nws', 'source': 'nws', 'title': p.get('event') or 'NWS alert',
            'issued_at': p.get('sent'), 'valid_from': p.get('onset') or p.get('effective'),
            'valid_to': p.get('ends') or p.get('expires'), 'severity': p.get('severity'),
            'area': p.get('areaDesc'), 'raw': p.get('headline', '') + '\n' + p.get('description', ''),
            'hazardous': p.get('severity') in {'Extreme', 'Severe'} or 'Warning' in (p.get('event') or ''),
        }, item.get('geometry')))
    return records


PARSERS = {'metars': metars, 'pireps': pireps, 'sigmets': sigmets, 'gairmets': gairmets, 'nws': nws}


def collect(name):
    url, provider, page = FEEDS[name]
    status = {'provider': provider, 'url': page, 'feed_url': url, 'ok': False, 'fetched_at': None}
    try:
        request = urllib.request.Request(url, headers={
            'User-Agent': 'FlightPlanner/1.0 (https://jouzan.github.io/flight-planner/)',
            'Accept': 'application/geo+json,application/json,application/xml',
        })
        with urllib.request.urlopen(request, timeout=35) as response:
            raw = response.read(25_000_001)
        if len(raw) > 25_000_000:
            raise ValueError('Feed exceeds size limit')
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        records = PARSERS[name](raw)
        if name in {'metars', 'pireps'} and not records:
            raise ValueError('Observation feed unexpectedly empty')
        status.update(ok=True, fetched_at=datetime.now(timezone.utc).isoformat(), count=len(records),
                      unmapped_count=sum(1 for record in records if not record['geometry']))
        return name, records, status
    except Exception as exc:
        status['error'] = type(exc).__name__ + ': ' + str(exc)[:180]
        return name, [], status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='weather-data/weather.json')
    args = parser.parse_args()
    with ThreadPoolExecutor(max_workers=5) as executor:
        products = list(executor.map(collect, FEEDS))
    snapshot = {'version': 1, 'generated_at': datetime.now(timezone.utc).isoformat(),
                'sources': {name: status for name, _, status in products},
                'type': 'FeatureCollection', 'features': [item for _, records, _ in products for item in records]}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(json.dumps({'generated_at': snapshot['generated_at'], 'sources': snapshot['sources'], 'bytes': path.stat().st_size}, indent=2))
    for name, _, status in products:
        if not status['ok']:
            print('::warning::' + name + ' unavailable: ' + status['error'])


if __name__ == '__main__':
    main()
