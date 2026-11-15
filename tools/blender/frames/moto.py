"""
ModCar frame 'moto' (燕子 Swallow): a fictional 1970s standard street bike, without its parts. docs/MODCAR.md 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/moto [--quick] [--no-preview] [--fit]

Writes public/models/modcar/frames/moto.glb and src/core/modcar/data/mounts/moto.json; previews go to
D:/modcar-scratch/moto/. --fit only places the stock part GLBs at the mounts and renders the fit study.

Blender axes: X forward, Y left, Z up, metres; origin on the ground under the middle of the wheelbase. Every
dimension is in the table D below and the steering / suspension geometry derived from it; the modelling code
(_moto_frame, _moto_fork, _moto_rear, _moto_build) only reads these.

What the frame is: a tubular steel double-cradle frame (head tube, backbone, down tubes running into the
cradle under the engine and up behind the gearbox, seat rails and rear subframe, gussets, lugs, brackets),
the front fork with its triple clamps, fender, disc and caliper and the instrument binnacle (FORK), the
swingarm with the chain, sprocket, chain guard and the rear brake drum plate (SWINGARM), the rear shocks
(SHOCK_UPPER_* on the frame, SHOCK_LOWER_* on the swingarm), the side stand (STAND), the rear fender, side
covers, footpegs, pedals, grab rail. The engine, gearbox, tank, seat, wheels, bar, lamps, mirrors ... are
parts placed by the game at the mount empties M_<id>.
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

PI = math.pi

# ============================================================================================ dimensions
D = dict(
    wb=1.38, ax_f=0.69, ax_r=-0.69, hub_z=0.31, wheel_r=0.309,
    # steering: rake from vertical, trail on the ground, triple-clamp offset (fork tubes ahead of the axis,
    # perpendicular), fork tube spacing (centre to centre / 2, the stock bar's caps sit at +-0.09)
    rake=27.0, trail=0.101, clamp_off=0.035, fork_hw=0.09,
    r_stanchion=0.0175, r_slider=0.024, r_shroud=0.0255,
    # stations along the steering axis (metres from the ground point G, see axis_pt)
    t_top=1.035,               # top face of the top clamp = FORK origin; the steering mount sits there on the tubes
    t_tc=0.030,                # top clamp thickness
    t_ht0=0.825, t_ht1=0.985,  # head tube
    t_lc=0.768, t_lc_h=0.038,  # lower clamp: bottom face and thickness
    t_slider=0.600,            # top of the sliders (dust seals)
    r_ht=0.0265,
    # engine / gearbox (stock eng_single + gb_moto): the gearbox tucks 8 cm into the back of the crankcase so the
    # swingarm pivot fits ahead of the rear tyre; its sprocket sits at hub height, the swingarm pivot between
    # the chain's runs
    eng_x=0.065, eng_z=0.255,
    gb_dx=-0.215, gb_dz=0.000,
    # exhaust: rolled outwards about its flange axis so the silencer clears the swingarm and the down tube
    exh_roll=-10.0,
    # swingarm and rear suspension
    pivot_x=-0.316, pivot_z=0.315,
    sa_hw0=0.088, sa_hw1=0.112,           # swingarm leg centres at the pivot and at the axle
    shock_lo=(-0.652, 0.338), shock_up=(-0.612, 0.655), shock_hw=0.142,
    # seat and rear frame
    seat_x=-0.500, seat_z=0.700,          # saddle pan centre on the rails
    rail_hw=0.080, r_loop=0.0145, r_rail=0.0145,
    # backbone: from the head tube (axis station t_bb) to the seat junction; the tank rides on it
    t_bb=0.935, bb1=(-0.262, 0.0, 0.692), r_bb=0.022, tank_s=0.327,
    battery=(-0.330, 0.0, 0.517),
)

RAKE = math.radians(D['rake'])
AX = np.array([-math.sin(RAKE), 0.0, math.cos(RAKE)])     # steering axis, pointing up
NF = np.array([math.cos(RAKE), 0.0, math.sin(RAKE)])      # perpendicular to it, forward-up, in the mid plane
G = np.array([D['ax_f'] + D['trail'], 0.0, 0.0])          # where the steering axis meets the ground


def axis_pt(t):
    """Point on the steering axis, t metres up from the ground point."""
    return G + AX * t


def tube_pt(t, side=0.0):
    """Point on a fork tube's axis at axis station t (side: +1 left tube, -1 right, 0 the mid plane)."""
    return G + AX * t + NF * D['clamp_off'] + np.array([0.0, side * D['fork_hw'], 0.0])


def fork_frame():
    """3x3 rotation whose columns are the fork's local axes: X forward (perpendicular to the steering axis),
    Y left, Z = the steering axis. The steering part's mount uses it (the bar turns about its local Z)."""
    return np.stack([NF, np.array([0.0, 1.0, 0.0]), AX], 1)


FORK_ORIGIN = axis_pt(D['t_top'])                 # top of the steering head, on the axis
STEER_MOUNT = tube_pt(D['t_top'])                 # the bar's yoke sits here (its caps on the fork tubes)
HUB_F = np.array([D['ax_f'], 0.0, D['hub_z']])
HUB_R = np.array([D['ax_r'], 0.0, D['hub_z']])
PIVOT = np.array([D['pivot_x'], 0.0, D['pivot_z']])
ENGINE = np.array([D['eng_x'], 0.0, D['eng_z']])
GEARBOX = ENGINE + np.array([D['gb_dx'], 0.0, D['gb_dz']])
# the stock single's exhaust port (its M_exhaust_out, part frame) is where the exhaust's flange goes
EXHAUST = ENGINE + np.array([0.22534, 0.0, 0.32129])



def t_at_z(z, off=None):
    """Axis station of a fork tube's point at height z."""
    off = D['clamp_off'] if off is None else off
    return (z - off * math.sin(RAKE)) / math.cos(RAKE)


def unit(v):
    v = np.asarray(v, float)
    return v / max(float(np.linalg.norm(v)), 1e-12)


# headlight: the lamp part's origin is the back of its bucket on the lamp's axis; the ears hold the bucket's sides
HL_Z = 0.836
HEADLIGHT = tube_pt(t_at_z(HL_Z)) + np.array([0.040, 0.0, 0.0])
HEADLIGHT[2] = HL_Z
# rider's footpegs (pivot of the folding peg), the brake pedal's pivot (right) and the gear pedal's (left), the
# passenger pegs; the side stand's pivot under the left cradle rail
PEG = np.array([-0.150, 0.0, 0.322])
PEDAL_PIVOT = np.array([-0.112, -0.1375, 0.318])
SHIFT_PIVOT = np.array([-0.112, 0.1495, 0.318])
PEG_P = np.array([-0.492, 0.0, 0.534])
STAND_PIVOT = np.array([-0.052, 0.104, 0.200])
# horn: on a tab under the lower clamp's right boss, hanging (the part is turned over: its foot on top)
HORN = tube_pt(t_at_z(0.686), -1.0) + np.array([0.034, -0.064, -0.071])


# tail lamp on a bracket over the rear fender's tail (the part's stalk reaches 0.03 forward of its origin)
TAILLIGHT = np.array([-1.005, 0.0, 0.585])
# stretch bumpers: a guard across the front fender's nose (on FORK_LOWER), one under the number plate
BUMPER_F = np.array([0.995, 0.0, 0.500])
BUMPER_R = np.array([-1.075, 0.0, 0.360])
# side stand: pivot, the foot (deployed, bike upright) and the fold (a single turn takes the leg back along
# the left cradle rail)
STAND_FOOT = np.array([-0.022, 0.250, 0.010])
_d1 = (STAND_FOOT - STAND_PIVOT) / np.linalg.norm(STAND_FOOT - STAND_PIVOT)
_d2 = np.array([-1.0, 0.06, 0.035]) / np.linalg.norm([-1.0, 0.06, 0.035])
STAND_AXIS = np.cross(_d1, _d2) / np.linalg.norm(np.cross(_d1, _d2))
STAND_FOLD_DEG = math.degrees(math.acos(float(np.clip(_d1 @ _d2, -1, 1))))
# round lenses (centre, axis, radius) registered while modelling, for their UVs
LAMPS = []


def rider_eye():
    """The stock saddle's EYE (0.06, 0, 0.84 in its frame) on the seat mount."""
    return np.array([D['seat_x'] + 0.06, 0.0, D['seat_z'] + 0.84])


def gauge_frame(sg):
    """Speedometer (sg = +1, left) or tachometer (-1): dial centre (glass plane), normal towards the rider,
    the dial's right (the rider's right, -Y) and up (its far edge) as the rider sees it."""
    c = STEER_MOUNT + fork_frame() @ np.array([0.066, sg * 0.0675, 0.080])
    nrm = rider_eye() - c
    nrm[1] = 0.0
    nrm = unit(nrm)
    right = np.array([0.0, -1.0, 0.0])
    up = np.cross(nrm, right)
    return c, nrm, right, up


def console_frame():
    """The warning-lamp console between the dials (same facing)."""
    c0, nrm, right, up = gauge_frame(1.0)
    c = STEER_MOUNT + fork_frame() @ np.array([0.058, 0.0, 0.083])
    return c, nrm, right, up


def ignition_frame():
    """Ignition (key) under the console, its bezel facing the rider: part local -X towards the eye."""
    c0, nrm, right, up = console_frame()
    c = c0 - up * 0.042 - nrm * 0.010
    return c, nrm, right, up


def axle_offset():
    """Axle ahead of the fork tube line (perpendicular to the axis) and its station along the axis."""
    d = HUB_F - G
    t = float(d @ AX)
    off = float(d @ NF)
    return t, off - D['clamp_off']


# ============================================================================================ the frame's lines
def loop_ctrl():
    """Left half of the main loop: one bent tube from inside the head tube down in front of the engine (down
    tube), under the engine and gearbox (cradle), up past the swingarm pivot (rear upright), back under the
    saddle (seat rail) and round the rear hoop to the centre line. (points, bend radii)."""
    pts = [axis_pt(0.858) + np.array([0.0, 0.010, 0.0]),
           (0.378, 0.030, 0.692),
           (0.322, 0.064, 0.430),
           (0.296, 0.075, 0.236),      # front cradle corner
           (-0.296, 0.088, 0.236),     # rear cradle corner
           (-0.318, 0.113, 0.352),     # past the pivot
           (-0.262, D['rail_hw'], 0.6875),   # seat junction
           (-0.935, D['rail_hw'], 0.6875),   # hoop corner
           (-0.935, 0.0, 0.6875)]
    radii = [0, 0.16, 0.35, 0.062, 0.058, 0.20, 0.050, 0.072, 0]
    return np.array([np.asarray(p, float) for p in pts]), radii


def main(args):
    from frames import _moto_build as MB
    if '--fit' in args:
        MB.fit(args)
    elif '--kit' in args:
        MB.kit_test(args)
    else:
        MB.build(args)
