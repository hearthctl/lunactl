"""Wandhalter: wall mount for the M5Stack StopWatch (C152) with a fixed USB-C plug.

The device drops in from above into a teardrop-shaped body. Two pads under the rim are the
mechanical stop, the rim with its sloped front lip holds the lower half of the device and runs
out into the device's outline just below its widest point, and a plug carrier (separate piece)
in the tip of the teardrop holds the USB-C plug so that it enters the socket from below. The
plug is what keeps the device from being lifted out. The carrier slides into the body from the wall side, so the wall keeps it in place.

Coordinates (print orientation, wall face on the bed): X = left/right, Y = up on the wall
(the USB-C socket is at -Y), Z = distance from the wall. The origin is the device centre
projected onto the wall. Device dimensions and their sources: ../../ref/README.md.
"""

from dataclasses import dataclass
from math import asin, cos, degrees, radians, sin

from build123d import Axis, Box, Circle, Cylinder, Part, Plane, Polygon, Pos, Rot, extrude, fillet, make_hull, revolve

from b123d_print import Mates, Overhang, Overlap, Slide, View


@dataclass(frozen=True)
class Dims:
    """All dimensions in mm."""

    # --- Device (see ref/README.md) ---
    DEV_D: float = 51.95  # housing diameter, official drawing; official STL 51.946
    DEV_T: float = 15.5  # rear plateau to glass, official drawing; STL housing alone 15.0
    DEV_GLASS_D: float = 49.0  # glass diameter, Kawacci STEP (not in the drawing): CONFIRM on device
    USB_BACK: float = 8.62  # socket centre above the rear plateau, official STL: CONFIRM on device
    USB_FLAT: float = 25.03  # device centre to the flat around the socket, official STL
    USB_FLAT_Z0: float = 6.5  # flat begins this far above the rear plateau, official STL
    USB_FLAT_Z1: float = 10.76  # flat ends, official STL
    USB_DX: float = 0.0  # socket centre left/right of the centre line, official STL: 0.000
    BUTTON_FROM: float = 32.7  # power button begins, degrees from the socket, official STL
    BUTTON_TO: float = 57.3  # power button ends, official STL
    BUTTON_R: float = 26.6  # power button reaches this far from the device centre, official STL
    BUTTON_Z0: float = 6.2  # power button begins this far above the rear plateau, official STL
    BUTTON_Z1: float = 11.0  # power button ends, official STL
    SPEAKER_Y: float = 10.0  # speaker recess begins this far above the centre, official STL
    SPEAKER_HALF_W: float = 10.5  # widest half width of the speaker recess, official STL

    # --- USB-C plug of the cable, measured by the user on 2026-11-16 ---
    PLUG_W: float = 10.18  # overmold width, measured
    PLUG_T: float = 4.41  # overmold thickness, measured
    PLUG_L: float = 14.55  # overmold face to rear shoulder, measured
    PLUG_TIP: float = 6.46  # metal shell beyond the overmold face, measured
    PLUG_TIP_W: float = 8.25  # metal shell width, USB-C spec
    PLUG_TIP_T: float = 2.4  # metal shell thickness, USB-C spec
    PLUG_EDGE: float = 0.3  # rounding of the overmold's front edges; not measured, assumed nearly square
    RELIEF_D: float = 3.09  # cable diameter at the rear shoulder, measured (no separate strain relief)

    # --- Holder ---
    BACK_T: float = 4.0  # plate between wall and device
    RIM_R: float = 27.25  # the rim's outline is a circle of this radius ...
    RIM_DROP: float = 4.5  # ... centred this far below the device centre: the rim thins towards its ends
    RIM_END: float = 5.0  # rim ends here, degrees below the widest point of the device; 1 mm of wall is left there
    PLATE_INSET: float = 1.25  # plate behind the upper half of the device stays this far inside the device outline
    RAD_CLEAR: float = 0.3  # rim to device, per side
    TIP_R: float = 12.5  # radius of the teardrop tip
    TIP_ABOVE_FLOOR: float = 7.275  # centre of the teardrop tip above the carrier bottom; leaves 2 mm wall at the bay corners
    EDGE_R: float = 2.0  # rounding of the outer front edge
    LIP_START: float = 14.3  # lip begins this far above the rear plateau (rim is full radius to 14.0)
    LIP_SLOPE: float = 0.8  # lip rise per mm inwards: 51 degrees from vertical, a 1 mm overhang over five layers
    LIP_R: float = 25.275  # lip reaches in to this radius: 0.7 mm over the housing edge; with LIP_SLOPE and LIP_EDGE the rim ends flush with the glass
    LIP_EDGE: float = 0.4  # thickness of the lip at its inner edge: two layers
    PAD_ANGLE: float = 30.0  # stop pads end here, degrees from the socket (button begins at 32.7)
    RELIEF_TO: float = 62.0  # button relief ends here, degrees from the socket (button ends at 57.3)
    RELIEF_CLEAR_R: float = 1.0  # button relief beyond the button, radially
    RELIEF_CLEAR_Z: float = 1.5  # button relief beyond the button, towards wall and front
    SPEAKER_CLEAR: float = 1.5  # plate cut-out margin around the speaker recess
    SCREW_HOLE_D: float = 4.5  # wall screw clearance hole; for a 4 mm countersunk screw, CONFIRM
    SCREW_HEAD_D: float = 8.5  # countersink diameter (90 degrees); CONFIRM
    SCREW_X: float = 14.0  # wall screws left/right of the centre

    # --- Plug carrier ---
    LATCH_T: float = 1.2  # latch on the carrier in front of the overmold face: keeps the plug when the device is pulled out
    LATCH_GAP_PLUG: float = 0.1  # latch to the overmold face
    LATCH_GAP_DEV: float = 0.25  # latch to the flat around the socket
    LATCH_CLEAR: float = 0.25  # latch slot around the metal shell, per side
    PLUG_SQUEEZE: float = 0.2  # pocket narrower than the overmold, total: the jaws grip the plug
    PLUG_DX: float = 0.0  # trim: move the plug left/right
    PLUG_DZ: float = 0.0  # trim: move the plug away from the wall
    CARRIER_W: float = 14.0  # carrier width; follows PLUG_W, the teardrop tip leaves no spare room
    CARRIER_TOP_GAP: float = 0.3  # carrier top below the lowest point of the device
    CARRIER_L: float = 17.25  # carrier length; follows PLUG_L and leaves room for a 1.2 mm latch
    RAIL_DROP: float = 4.0  # rails this far below the carrier top, where the teardrop is still wide
    FLOOR_GAP: float = 0.2  # carrier to the bay floor and to the bay top
    BAY_DEPTH: float = 15.15  # bay roof from the wall; the roof keeps the plug in its pocket, so it follows PLUG_T
    JAW_MIN: float = 2.0  # least carrier wall beside the plug
    LEDGE_MIN: float = 2.0  # least ledge under the rear shoulder (takes the push when docking)
    RELIEF_CLEAR: float = 0.3  # slot around the strain relief, per side
    TIP_CLEAR: float = 0.4  # slot around the metal shell, per side
    RAIL_D: float = 1.2  # rail on each carrier side, out of the side
    RAIL_H: float = 2.0  # rail height
    CARRIER_CLEAR: float = 0.2  # carrier to bay, per side
    ROOF_GAP: float = 0.3  # least gap from plug, strain relief and carrier to the bay roof (a bridge, may sag)
    BACK_RECESS: float = 0.2  # carrier back stays this far inside the wall face

    # --- Derived ---
    @property
    def DEV_R(self):
        return self.DEV_D / 2

    @property
    def R_IN(self):  # rim inner radius
        return self.DEV_R + self.RAD_CLEAR

    @property
    def R_PLATE(self):  # plate behind the upper half of the device
        return self.DEV_R - self.PLATE_INSET

    @property
    def END_WALL(self):  # rim wall left at its ends
        a = radians(self.RIM_END)
        return self.RIM_DROP * sin(a) + (self.RIM_R**2 - (self.RIM_DROP * cos(a)) ** 2) ** 0.5 - self.R_IN

    @property
    def Z_FRONT(self):  # front face of the holder
        return self.lip_z(self.LIP_R) + self.LIP_EDGE

    @property
    def PLUG_X(self):
        return self.USB_DX + self.PLUG_DX

    @property
    def PLUG_Z(self):  # plug centre from the wall
        return self.BACK_T + self.USB_BACK + self.PLUG_DZ

    @property
    def PLUG_FACE_GAP(self):  # overmold face below the socket flat when docked: room for the latch
        return self.LATCH_GAP_DEV + self.LATCH_T + self.LATCH_GAP_PLUG

    @property
    def LATCH_Y0(self):  # latch face towards the plug
        return self.FACE_Y + self.LATCH_GAP_PLUG

    @property
    def LATCH_Y1(self):  # latch face towards the device
        return -(self.USB_FLAT + self.LATCH_GAP_DEV)

    @property
    def TIP_Y(self):  # centre of the teardrop tip
        return self.BOTTOM_Y + self.TIP_ABOVE_FLOOR

    @property
    def FACE_Y(self):  # overmold face when docked
        return -(self.USB_FLAT + self.PLUG_FACE_GAP)

    @property
    def SHOULDER_Y(self):
        return self.FACE_Y - self.PLUG_L

    @property
    def BOTTOM_Y(self):
        return self.CARRIER_TOP_Y - self.CARRIER_L

    @property
    def LEDGE_T(self):  # ledge under the rear shoulder
        return self.SHOULDER_Y - self.BOTTOM_Y

    @property
    def JAW_T(self):  # carrier wall beside the plug
        return (self.CARRIER_W - self.PLUG_W + self.PLUG_SQUEEZE) / 2

    @property
    def PLUG_ROOF_GAP(self):  # thickest part of the plug to the bay roof
        return self.BAY_DEPTH - self.PLUG_Z - max(self.PLUG_T, self.RELIEF_D) / 2

    @property
    def CARRIER_TOP_Y(self):
        return -(self.DEV_R + self.CARRIER_TOP_GAP)

    @property
    def BAY_HW(self):
        return self.CARRIER_W / 2 + self.CARRIER_CLEAR

    @property
    def BAY_TOP_Y(self):  # above the overmold face, below the pads
        return self.FACE_Y + self.PLUG_FACE_GAP

    @property
    def BAY_Z(self):  # bay roof
        return self.BAY_DEPTH

    @property
    def RAIL_Y(self):
        return self.CARRIER_TOP_Y - self.RAIL_DROP

    @property
    def PAD_FROM(self):  # stop pads begin beside the bay, degrees from the socket
        return degrees(asin(self.BAY_HW / self.DEV_R))

    @property
    def INSERTION(self):  # plug depth past the socket flat when docked
        return self.PLUG_TIP - self.PLUG_FACE_GAP

    def __post_init__(self):
        if self.JAW_T < self.JAW_MIN:
            raise ValueError(f"plug too wide for the carrier: wall {self.JAW_T:.2f} mm; raise CARRIER_W")
        if self.LEDGE_T < self.LEDGE_MIN:
            raise ValueError(f"plug too long for the carrier: ledge {self.LEDGE_T:.2f} mm; raise CARRIER_L")
        if self.END_WALL < 0.8:
            raise ValueError(f"rim ends too thin: {self.END_WALL:.2f} mm; raise RIM_R or RIM_END")
        if self.PLUG_ROOF_GAP < self.ROOF_GAP:
            raise ValueError(f"plug too thick for the bay: roof gap {self.PLUG_ROOF_GAP:.2f} mm; raise BAY_DEPTH")

    def lip_z(self, r):
        """Height of the sloped lip underside at radius r."""
        return self.BACK_T + self.LIP_START + (self.R_IN - r) * self.LIP_SLOPE


PRINT = {
    "supports": "none",
    "why": "wall face on the bed; the lip overhangs 1 mm at 51 degrees, the plug bay roof is a 17 mm bridge",
}
PRINT_NOTES = (
    "Press the plug into the carrier from the open side, between ledge and latch, slide the carrier into the body from the wall side, then screw the body to the wall."
)


def box(x0, x1, y0, y1, z0, z1):
    return Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * Box(x1 - x0, y1 - y0, z1 - z0)


def wedge(a0: float, a1: float):
    """Sketch of everything between two angles around the device axis; degrees from +X."""
    return Polygon((0, 0), (60 * cos(radians(a0)), 60 * sin(radians(a0))), (60 * cos(radians(a1)), 60 * sin(radians(a1))), align=None)


def latch(d: Dims):
    """Cap on the carrier in front of the overmold face. It fills the room between plug and device
    where the housing is flat around the socket; the slot for the metal shell is open to the front."""
    x, y0, y1, hw = d.PLUG_X, min(d.LATCH_Y0, d.CARRIER_TOP_Y), d.LATCH_Y1, d.CARRIER_W / 2
    # the housing's chamfers above and below the flat run at 45 degrees; the cap follows them. The
    # lower chamfer is only 0.73 mm deep, then the housing steps out: 0.25 mm more room there
    za, zb = d.BACK_T + d.USB_FLAT_Z0 + 0.25, d.BACK_T + d.USB_FLAT_Z1 - 0.1
    cap = Plane.YZ * Polygon((y1, za), (y1, zb), (y0, zb + y1 - y0), (y0, za - y1 + y0), align=None)
    cap = Pos(x - hw, 0, 0) * extrude(cap, 2 * hw)
    return cap & box(x - hw, x + hw, y0 - 1, y1 + 1, d.BACK_RECESS, d.BAY_Z - d.ROOF_GAP)


def cavity(d: Dims):
    """Room for the device under the lip. The rim ends below the widest point, so the way in from above is free."""
    half = [(0, d.BACK_T), (d.R_IN, d.BACK_T), (d.R_IN, d.lip_z(d.R_IN)), (d.LIP_R, d.lip_z(d.LIP_R)), (d.LIP_R, d.Z_FRONT + 1), (0, d.Z_FRONT + 1)]
    return revolve(Plane.XZ * Polygon(*half, align=None), Axis.Z, 360)


def pads(d: Dims):
    """Stop pads under the rim, left and right of the plug bay: no clearance, the device rests on them."""
    r = d.R_IN + 0.5  # into the rim wall
    face = Plane.XZ * Polygon((d.DEV_R, 0.5), (r, 0.5), (r, d.lip_z(d.R_IN)), (d.R_IN, d.lip_z(d.R_IN)), (d.DEV_R, d.lip_z(d.DEV_R)), align=None)
    arc = d.PAD_ANGLE - d.PAD_FROM
    return [Rot(0, 0, 270 + d.PAD_FROM) * revolve(face, Axis.Z, arc), Rot(0, 0, 270 - d.PAD_ANGLE) * revolve(face, Axis.Z, arc)]


def button_reliefs(d: Dims):
    """Pockets in the rim so the power button is never pressed; one per side, the rim is symmetric."""
    r, z0, z1 = d.BUTTON_R + d.RELIEF_CLEAR_R, d.BACK_T + d.BUTTON_Z0 - d.RELIEF_CLEAR_Z, d.BACK_T + d.BUTTON_Z1 + d.RELIEF_CLEAR_Z
    grow = r - d.R_IN + 0.1  # roof slopes at 45 degrees so it prints without support
    face = Plane.XZ * Polygon((d.R_IN - 0.1, z0), (r, z0), (r, z1), (d.R_IN - 0.1, z1 + grow), align=None)
    arc = d.RELIEF_TO - d.PAD_ANGLE
    return [Rot(0, 0, 270 + d.PAD_ANGLE) * revolve(face, Axis.Z, arc), Rot(0, 0, 270 - d.RELIEF_TO) * revolve(face, Axis.Z, arc)]


def body(d: Dims) -> Part:
    outline = make_hull((Pos(0, -d.RIM_DROP) * Circle(d.RIM_R) + Pos(0, d.TIP_Y) * Circle(d.TIP_R)).edges())
    part = extrude(outline, d.Z_FRONT)
    part = fillet([e for e in part.edges() if abs(e.center().Z - d.Z_FRONT) < 1e-6], d.EDGE_R)
    above = [wedge(-d.RIM_END, 100), wedge(80, 180 + d.RIM_END)]  # everything above the rim ends
    for cut in above:
        part -= Pos(0, 0, -1) * extrude(cut, d.Z_FRONT + 2)
    part += extrude(outline - above[0] - above[1] + Circle(d.R_PLATE), d.BACK_T)
    part -= cavity(d)
    for pad in pads(d):
        part += pad
    for relief in button_reliefs(d):
        part -= relief

    # plug bay, open to the wall, with a groove per side for the carrier rails
    x = d.PLUG_X
    bay_bottom = d.BOTTOM_Y - d.FLOOR_GAP
    part -= box(x - d.BAY_HW, x + d.BAY_HW, bay_bottom, d.CARRIER_TOP_Y + d.FLOOR_GAP, -1, d.BAY_Z)
    groove = d.BAY_HW + d.RAIL_D + d.CARRIER_CLEAR
    half = d.RAIL_H / 2 + d.CARRIER_CLEAR
    part -= box(x - groove, x + groove, d.RAIL_Y - half, d.RAIL_Y + half, -1, d.BAY_Z)
    # the latch stands above the carrier, the metal shell above the latch; cut the full bay
    # width up to the lip so no thin fin is left between bay and device
    part -= box(x - d.BAY_HW, x + d.BAY_HW, d.CARRIER_TOP_Y, d.BAY_TOP_Y, -1, d.lip_z(d.R_IN))
    tip = d.PLUG_TIP_W / 2 + d.TIP_CLEAR
    part -= box(x - tip, x + tip, d.BAY_TOP_Y - 1, d.BAY_TOP_Y + d.PLUG_TIP + 1, -1, d.BACK_T + 1)
    # the cable leaves through the floor of the bay
    cable = d.RELIEF_D / 2 + d.RELIEF_CLEAR
    part -= box(x - cable, x + cable, d.TIP_Y - d.TIP_R - 1, bay_bottom + 1, -1, d.BAY_Z)

    # the speaker fires to the rear: open the plate behind it, up to the top edge
    hw = d.SPEAKER_HALF_W + d.SPEAKER_CLEAR
    part -= box(-hw, hw, d.SPEAKER_Y - d.SPEAKER_CLEAR, d.DEV_R + 1, -1, d.BACK_T + 1)

    for sx in (-d.SCREW_X, d.SCREW_X):
        part -= Pos(sx, 0, d.BACK_T / 2) * Cylinder(d.SCREW_HOLE_D / 2, d.BACK_T + 2)
        depth = (d.SCREW_HEAD_D - d.SCREW_HOLE_D) / 2
        sink = Plane.XZ * Polygon(
            (0, d.BACK_T - depth), (d.SCREW_HOLE_D / 2, d.BACK_T - depth),
            (d.SCREW_HEAD_D / 2 + 0.5, d.BACK_T + 0.5), (0, d.BACK_T + 0.5), align=None,
        )
        part -= Pos(sx, 0, 0) * revolve(sink, Axis.Z, 360)
    return part


def carrier_placed(d: Dims) -> Part:
    """The plug carrier where it sits in the body."""
    x = d.PLUG_X
    hw = d.CARRIER_W / 2
    z1 = d.BAY_Z - d.ROOF_GAP
    part = box(x - hw, x + hw, d.BOTTOM_Y, d.CARRIER_TOP_Y, d.BACK_RECESS, z1)
    part += box(x - hw - d.RAIL_D, x + hw + d.RAIL_D, d.RAIL_Y - d.RAIL_H / 2, d.RAIL_Y + d.RAIL_H / 2, d.BACK_RECESS, z1)
    pocket = (d.PLUG_W - d.PLUG_SQUEEZE) / 2
    part += latch(d)
    part -= box(x - pocket, x + pocket, d.SHOULDER_Y, d.LATCH_Y0, d.PLUG_Z - d.PLUG_T / 2, z1 + 1)
    shell = d.PLUG_TIP_W / 2 + d.LATCH_CLEAR  # slot for the metal shell, open to the front
    part -= box(x - shell, x + shell, d.LATCH_Y0 - 0.01, d.LATCH_Y1 + 1, d.PLUG_Z - d.PLUG_TIP_T / 2 - d.LATCH_CLEAR, z1 + 1)
    slot = d.RELIEF_D / 2 + d.RELIEF_CLEAR
    part -= box(x - slot, x + slot, d.BOTTOM_Y - 1, d.SHOULDER_Y + 1, d.PLUG_Z - slot, z1 + 1)
    return part


def carrier(d: Dims) -> Part:
    return Pos(0, 0, -d.BACK_RECESS) * carrier_placed(d)


def device_standin(d: Dims) -> Part:
    """The device, docked: housing (rim profile from the official STL), socket flat, glass."""
    r, t = d.DEV_R, d.BACK_T
    rim = [(0, 0), (r, 0), (r, 14.0), (r - 0.14, 14.36), (r - 0.36, 14.7), (r - 0.68, 14.92), (r - 1.03, 15.0), (0, 15.0)]
    part = Pos(0, 0, t) * revolve(Plane.XZ * Polygon(*rim, align=None), Axis.Z, 360)
    part += Pos(0, 0, t + d.DEV_T - 0.25) * Cylinder(d.DEV_GLASS_D / 2, 0.5)
    # flat around the socket with its two chamfers, from the official STL section at the centre line
    y, z0, z1 = -d.USB_FLAT, t + d.USB_FLAT_Z0, t + d.USB_FLAT_Z1
    flat = Plane.YZ * Polygon((y, z0), (y, z1), (y - 0.88, z1 + 0.88), (-r - 1, z1 + 0.88), (-r - 1, z0 - 0.73), (y - 0.73, z0 - 0.73), align=None)
    part -= Pos(-8, 0, 0) * extrude(flat, 16)
    z = t + d.USB_BACK
    part -= box(d.USB_DX - 4.5, d.USB_DX + 4.5, -d.USB_FLAT - 0.1, -d.USB_FLAT + 8, z - 1.65, z + 1.65)
    return part


def plug_standin(d: Dims) -> Part:
    """The plug as the carrier holds it; the overmold is drawn squeezed to the pocket width."""
    x, w = d.PLUG_X, (d.PLUG_W - d.PLUG_SQUEEZE) / 2
    h, e = d.PLUG_T / 2, d.PLUG_EDGE
    side = Plane.YZ * Polygon(
        (d.SHOULDER_Y, -h), (d.FACE_Y - e, -h), (d.FACE_Y, -h + e), (d.FACE_Y, h - e), (d.FACE_Y - e, h), (d.SHOULDER_Y, h),
        align=None,
    )
    part = Pos(x - w, 0, d.PLUG_Z) * extrude(side, 2 * w)
    part += box(x - d.PLUG_TIP_W / 2, x + d.PLUG_TIP_W / 2, d.FACE_Y, d.FACE_Y + d.PLUG_TIP,
                d.PLUG_Z - d.PLUG_TIP_T / 2, d.PLUG_Z + d.PLUG_TIP_T / 2)
    part += box(x - d.RELIEF_D / 2, x + d.RELIEF_D / 2, d.BOTTOM_Y - 8, d.SHOULDER_Y,
                d.PLUG_Z - d.RELIEF_D / 2, d.PLUG_Z + d.RELIEF_D / 2)
    return part


def build(d: Dims):
    return {"body": lambda: body(d), "carrier": lambda: carrier(d)}


def assembly(d: Dims):
    return [
        (body(d), "#3a6ea5", "body"),
        (carrier_placed(d), "#d08a2e", "carrier"),
        (device_standin(d), "#bbbbbb", "device (stand-in)"),
        (plug_standin(d), "#555555", "plug (stand-in)"),
    ]


def views(d: Dims):
    return [
        View("YZ", d.PLUG_X, "centre line: plate, plug bay, lip"),
        View("XY", d.PLUG_Z, "socket height: pads, bay, rails, rim ends"),
        View("XZ", d.RAIL_Y, "rails"),
        View("XY", d.BACK_T + (d.BUTTON_Z0 + d.BUTTON_Z1) / 2, "power button height: relief in the rim"),
    ]


def checks(d: Dims):
    return [
        Overhang("body", max_angle=52, fail=True),  # the lip overhangs at 51 degrees so the rim can end flush with the glass
        Overhang("carrier", fail=True),
        Overlap(),
        Mates(ignore=[("carrier", "plug (stand-in)"), ("body", "device (stand-in)")]),
        Slide("device (stand-in)", direction=(0, 1, 0), distance=40, against=("body", "carrier")),
        Slide("carrier", direction=(0, 0, -1), distance=25, against=("body",)),
    ]


if __name__ == "__main__":
    from b123d_print import run

    run(__file__)
