import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1] / 'scripts/collect_weather.py')
wx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wx)


class WeatherTests(unittest.TestCase):
    def test_cloud_base_is_not_ceiling_and_missing_is_not_zero(self):
        raw = b'''<response><data><METAR><station_id>KAAA</station_id><latitude>33</latitude><longitude>-112</longitude>
        <sky_condition sky_cover="FEW" cloud_base_ft_agl="500"/><sky_condition sky_cover="BKN" cloud_base_ft_agl="1200"/>
        <flight_category>MVFR</flight_category></METAR><METAR><station_id>KBBB</station_id><latitude>34</latitude><longitude>-113</longitude>
        <sky_condition sky_cover="CLR"/></METAR></data></response>'''
        a, b = [f['properties'] for f in wx.metars(raw)]
        self.assertEqual(a['cloud_base_agl_ft'], 500)
        self.assertEqual(a['ceiling_agl_ft'], 1200)
        self.assertFalse(a['hazardous'])
        self.assertIsNone(b['ceiling_agl_ft'])
        self.assertIsNone(b['cloud_base_agl_ft'])

    def test_zero_vertical_visibility_is_a_real_ifr_ceiling(self):
        raw = b'<root><METAR><latitude>0</latitude><longitude>0</longitude><vert_vis_ft>0</vert_vis_ft><flight_category>LIFR</flight_category></METAR></root>'
        p = wx.metars(raw)[0]['properties']
        self.assertEqual(p['ceiling_agl_ft'], 0)
        self.assertTrue(p['hazardous'])

    def test_decoded_metar_fields_preserve_zero_and_missing_values(self):
        raw=b'<root><METAR><latitude>33</latitude><longitude>-112</longitude><temp_c>0</temp_c><wind_speed_kt>0</wind_speed_kt><wind_dir_degrees>VRB</wind_dir_degrees><altim_in_hg>29.92</altim_in_hg><wx_string>-RA</wx_string></METAR></root>'
        p=wx.metars(raw)[0]['properties']
        self.assertEqual(p['temperature_c'],0)
        self.assertEqual(p['wind_speed_kt'],0)
        self.assertEqual(p['wind_direction'],'VRB')
        self.assertIsNone(p['dewpoint_c'])
        self.assertEqual(p['altimeter_inhg'],29.92)
        self.assertEqual(p['present_weather'],'-RA')

    def test_negative_icing_and_turbulence_do_not_raise_hazards(self):
        raw = b'<root><AircraftReport><latitude>34</latitude><longitude>-112</longitude><icing_condition icing_intensity="NEG"/><turbulence_condition turbulence_intensity="NEG"/></AircraftReport></root>'
        p = wx.pireps(raw)[0]['properties']
        self.assertFalse(p['has_ice'])
        self.assertFalse(p['has_turbulence'])
        self.assertFalse(p['hazardous'])

    def test_moderate_turbulence_and_light_icing_are_flagged(self):
        for condition in [b'<turbulence_condition turbulence_intensity="MOD"/>', b'<icing_condition icing_intensity="LGT"/>']:
            raw = b'<root><AircraftReport><latitude>34</latitude><longitude>-112</longitude>' + condition + b'</AircraftReport></root>'
            self.assertTrue(wx.pireps(raw)[0]['properties']['hazardous'])

    def test_missing_positions_are_never_mapped_at_zero(self):
        self.assertEqual(wx.metars(b'<root><METAR><latitude>33</latitude></METAR></root>'), [])
        self.assertIsNone(wx.number('null00'))
        self.assertIsNone(wx.point(None, None))

    def test_sigmet_multipart_geometry_and_extended_longitude(self):
        raw = json.dumps([{'geom': 'AREAS', 'coords': [[{'lon': 180, 'lat': 60}, {'lon': 184, 'lat': 60}, {'lon': 185, 'lat': 62}]], 'hazard': 'ICE', 'validTimeTo': 1793664000}]).encode()
        f = wx.sigmets(raw)[0]
        self.assertEqual(f['geometry']['type'], 'MultiPolygon')
        self.assertEqual(f['geometry']['coordinates'][0][0][1][0], -176)
        self.assertTrue(f['properties']['hazardous'])

    def test_gairmet_freezing_level_is_not_invented_icing(self):
        raw = b'<root><GAIRMET><hazard type="FZLVL"/><geometry_type>LINE</geometry_type></GAIRMET></root>'
        self.assertEqual(wx.gairmets(raw), [])

    def test_feed_failure_is_explicit_not_an_empty_success(self):
        with patch.object(wx.urllib.request, 'urlopen', side_effect=TimeoutError('Offline')):
            name, records, status = wx.collect('sigmets')
        self.assertEqual(name, 'sigmets')
        self.assertFalse(status['ok'])
        self.assertIsNone(status['fetched_at'])
        self.assertIn('TimeoutError', status['error'])

    def test_nws_unlocated_alerts_are_preserved_without_fake_points(self):
        raw = json.dumps({'features': [{'geometry': None, 'properties': {'event': 'Winter Storm Warning', 'severity': 'Severe'}}]}).encode()
        f = wx.nws(raw)[0]
        self.assertIsNone(f['geometry'])
        self.assertTrue(f['properties']['hazardous'])


if __name__ == '__main__':
    unittest.main()
