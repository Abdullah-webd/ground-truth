"""Place-label decoding and geometry helpers (no network)."""

import math

from ground_truth import labels as L


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _field(num: int, wire: int, payload: bytes | int) -> bytes:
    key = _varint((num << 3) | wire)
    if wire == 0:
        return key + _varint(payload)
    return key + _varint(len(payload)) + payload


def _zz(n: int) -> int:
    return (n << 1) ^ (n >> 31)


def _tile_with_town() -> bytes:
    """A one-layer MVT: a 'place' point named Testville (class town) at the tile centre."""
    geom = _varint((1 << 3) | 1) + _varint(_zz(2048)) + _varint(_zz(2048))
    feature = _field(2, 2, _varint(0) + _varint(0) + _varint(1) + _varint(1)) + _field(3, 0, 1) + _field(4, 2, geom)
    layer = (
        _field(15, 0, 2)
        + _field(1, 2, b"place")
        + _field(2, 2, feature)
        + _field(3, 2, b"name")
        + _field(3, 2, b"class")
        + _field(4, 2, _field(1, 2, b"Testville"))
        + _field(4, 2, _field(1, 2, b"town"))
        + _field(5, 0, 4096)
    )
    return _field(3, 2, layer)


def test_decode_point_label_at_tile_centre():
    items = L.tile_labels(1, 1, 0, _tile_with_town())
    assert items == [{"n": "Testville", "k": "town", "c": "town", "r": 10, "lat": items[0]["lat"], "lon": 90.0}]
    # Centre of tile (1, 1, 0) is lon 90, lat = mercator inverse of y = 0.25
    assert math.isclose(items[0]["lat"], math.degrees(math.atan(math.sinh(math.pi / 2))), abs_tol=1e-4)


def test_geometry_linestring_decoding():
    cmds = [(1 << 3) | 1, _zz(10), _zz(20), (2 << 3) | 2, _zz(5), _zz(0), _zz(0), _zz(5)]
    assert L._geometry(cmds) == [[(10, 20), (15, 20), (15, 25)]]


def test_bearing_words():
    # A point north-west of a town is "north-west of" it.
    assert L._bearing_word(1.0, -1.0, 0.0, 0.0) == "north-west"
    assert L._bearing_word(-1.0, 0.0, 0.0, 0.0) == "south"


def test_tile_xy_matches_known_tile():
    assert L._tile_xy(37.7755, -122.4063, 14) == (2621, 6332)
