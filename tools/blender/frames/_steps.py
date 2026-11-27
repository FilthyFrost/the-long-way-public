"""The stairwell sunk into a camper's floor inside its entry door, as Nomad Drive's campers have theirs (the player's ask,
2026-11-26: the steps up into every camper as handsome as Nomad Drive's - part of the body, fitting it, plain to see).

The door goes down to the stairwell's lowest tread and shuts over the well, its bottom edge on the tread's nosing at the
body's face; inside, the treads go up to the floor - black ribbed rubber in a dark tray, a bright aluminium nosing along
each edge, the risers in the room's floor finish, the well's walls in its wall lining. Under the body's own bottom line
the well is a dark housing: its two cheeks beside the opening (the body's own skin is cut away between them,
drop_box), its face under the lowest tread, its bottom. The step that slides out from under the housing is the game's
(src/game/modcar/carView.ts buildSteps); the treads' tops and depths are core/modcar/aboard.ts BoardDoor.well's.
Left coordinates (Blender: x forward, y left, z up; the body's side at +y); the frames mirror it onto the right."""
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402

JAMB = 0.012      # the well's wall linings either side
CHEEK = 0.03      # the housing's cheeks, outside the opening's edges
HOUSING = 0.045   # the housing's bottom under the lowest tread


def drop_box(buf, lo, hi):
    """The buffer without its triangles whose middles lie in the box [lo, hi] (Blender coordinates)."""
    V, N, T, M = buf.arrays()
    if len(T) == 0:
        return buf
    c = V[T].mean(axis=1)
    lo = np.asarray(lo, float)
    hi = np.asarray(hi, float)
    out = ~((c >= lo) & (c <= hi)).all(axis=1)
    b = K.Buf()
    if out.any():
        b.add(V, N, T[out], 'paint', uv=buf.uv_array() if buf.has_uv() else None)
        b.M = [m for m, k in zip(M, out) if k]
    return b


def housing_bottom(tops):
    """The housing's underside under the lowest tread."""
    return float(tops[0]) - HOUSING


def stairwell(xa, xb, yf, floor, tops, depth, z_side, riser='wood', wall='lining', ribs=4, nosing='alu', top_nosing=True):
    """The stairwell (left coordinates) in the opening between xa and xb (the body's edges of the door opening, rear and
    front) from the body's outer face at y = yf in: its treads (tops: the lowest first, at the door; each `depth` deep),
    their risers up to the floor at `floor`, the walls either side, and under the body's side - which ends at the bottom
    at z_side - the housing: its cheeks, its face under the lowest tread, its bottom."""
    b = K.Buf()
    n = len(tops)
    y_in = yf - n * depth
    zh = housing_bottom(tops)
    x0, x1 = xa + JAMB, xb - JAMB
    for k, top in enumerate(tops):
        ya = yf - (k + 1) * depth
        yb = yf - k * depth
        # the tray, the rubber mat in it with its ribs across the way up, the nosing along the outer edge (at the door:
        # the threshold the door shuts onto, a few millimetres proud of the face)
        b.extend(K.box_buf((x0, ya, top - 0.036), (x1, yb - 0.02, top - 0.005), 'trim', 0.003, 1))
        b.extend(K.box_buf((x0 + 0.012, ya + 0.004, top - 0.006), (x1 - 0.012, yb - 0.03, top), 'rubber', 0.002, 1))
        for r in range(ribs):
            yc = ya + 0.03 + (yb - 0.06 - ya - 0.03) * (r + 0.5) / ribs
            b.extend(K.box_buf((x0 + 0.03, yc - 0.005, top - 0.001), (x1 - 0.03, yc + 0.005, top + 0.003), 'rubber', 0.0015, 1))
        yo = yb + (0.004 if k == 0 else 0.0)
        b.extend(K.box_buf((x0 - (0.0 if k else JAMB), yb - 0.032, top - 0.03), (x1 + (0.0 if k else JAMB), yo, top + 0.002), nosing, 0.003, 1))
        # the riser up to the next tread (or the floor), in the floor's finish, set back under the next one's nosing
        up = tops[k + 1] if k + 1 < n else floor
        b.extend(K.box_buf((x0, ya - 0.012, top - 0.004), (x1, ya, up - 0.004), riser, 0.002, 1))
    if top_nosing:
        # the floor's own edge over the top riser
        b.extend(K.box_buf((x0, y_in - 0.03, floor - 0.028), (x1, y_in + 0.002, floor + 0.002), nosing, 0.003, 1))
    # the well's walls (behind the shut door's leaf, 5.5 cm in from the face), from the housing's bottom to the floor
    for xs in ((xa, x0), (x1, xb)):
        b.extend(K.box_buf((xs[0], y_in - 0.012, zh), (xs[1], yf - 0.055, floor - 0.004), wall, 0.002, 1))
    # the housing: its cheeks outside the opening's edges from its bottom up to where the body's side ends, its face
    # under the threshold, its bottom, its back under the floor
    for xs in ((xa - CHEEK, xa), (xb, xb + CHEEK)):
        b.extend(K.box_buf((xs[0], y_in - 0.012, zh - 0.012), (xs[1], yf, z_side), 'trim', 0.004, 1))
    b.extend(K.box_buf((xa, yf - 0.014, zh - 0.012), (xb, yf - 0.002, tops[0] - 0.03), 'trim', 0.003, 1))
    b.extend(K.box_buf((xa, y_in - 0.012, zh - 0.012), (xb, yf - 0.002, zh), 'trim', 0.003, 1))
    b.extend(K.box_buf((xa, y_in - 0.024, zh), (xb, y_in - 0.012, tops[-1] - 0.03), 'trim', 0.002, 1))
    return b


def floor_round(x0, x1, y0, y1, z0, z1, mat, hole, bevel=0.002):
    """A floor slab over [x0, x1] x [y0, y1] (z0..z1) with a rectangular hole (hx0, hx1, hy0, hy1) cut out of it: up to
    four boxes round the hole."""
    hx0, hx1, hy0, hy1 = hole
    b = K.Buf()
    parts = [(x0, hx0, y0, y1), (hx1, x1, y0, y1), (hx0, hx1, y0, hy0), (hx0, hx1, hy1, y1)]
    for a0, a1, c0, c1 in parts:
        a0, a1 = max(a0, x0), min(a1, x1)
        c0, c1 = max(c0, y0), min(c1, y1)
        if a1 - a0 > 1e-4 and c1 - c0 > 1e-4:
            b.extend(K.box_buf((a0, c0, z0), (a1, c1, z1), mat, bevel, 1))
    return b


def moulding(xa, xb, z_foot, z_top, r_top, y_face, mat='trim', off=0.016, n_up=24):
    """A moulding round a door's opening (left coordinates), as Nomad Drive's campers have one (dark on the class C,
    white with round corners on the class A): up its rear edge from z_foot, round its head (the opening's corners of
    radius r_top), down its front edge - a low rounded section 2.6 cm wide standing 9 mm proud of the face, `off` out
    from the opening's edge. y_face(x, z): the face's y there."""
    x0, x1 = xa - off, xb + off
    z1 = z_top + off
    r = r_top + off
    pts = [(x0, z) for z in np.linspace(z_foot, z1 - r, n_up)]
    pts += [(x0 + r + r * np.cos(a), z1 - r + r * np.sin(a)) for a in np.linspace(np.pi, np.pi / 2, 10)[1:]]
    pts += [(x, z1) for x in np.linspace(x0 + r, x1 - r, 12)[1:]]
    pts += [(x1 - r + r * np.cos(a), z1 - r + r * np.sin(a)) for a in np.linspace(np.pi / 2, 0.0, 10)[1:]]
    pts += [(x1, z) for z in np.linspace(z1 - r, z_foot, n_up)[1:]]
    P = np.array([(x, y_face(x, z), z) for x, z in pts])
    N = np.tile((0.0, 1.0, 0.0), (len(P), 1))
    prof = np.array([(-0.014, 0.0), (-0.014, 0.004), (-0.010, 0.009), (0.008, 0.009), (0.012, 0.005), (0.012, 0.0)])
    V, NN, T = K.sweep(P, N, prof, closed=False)
    b = K.Buf().add(V, NN, T, mat)
    # (its two feet closed)
    for e in (0, -1):
        ring = V.reshape(len(P), -1, 3)[e]
        b.extend(K.fill_loop(ring, (0.0, 0.0, -1.0), mat))
    return b


def jambs(xa, xb, yf, z_foot, z_top, mat='trim', depth=0.06):
    """The opening's sides on down from the door's foot to the well's housing (left coordinates): its return into the
    body, `depth` deep from the face at yf, where the body's own return (round the door's sides and head) stops."""
    b = K.Buf()
    for x0, x1 in ((xa - 0.012, xa), (xb, xb + 0.012)):
        b.extend(K.box_buf((x0, yf - depth, z_foot), (x1, yf - 0.001, z_top), mat, 0.002, 1))
    return b


def kick_panel(x0, x1, yf, top, z_door, mat, thick=0.045):
    """The door leaf's foot (left coordinates): a panel from just over the well's threshold (`top`, the lowest tread)
    up to the leaf's own bottom edge z_door, its face flush with the leaf's, between x0 and x1 (the leaf's edges)."""
    return K.box_buf((x0 + 0.001, yf - thick, top + 0.006), (x1 - 0.001, yf, z_door), mat, 0.004, 2)
