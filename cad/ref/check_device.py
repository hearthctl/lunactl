"""Independent check: official housing mesh against the exported holder meshes."""
import sys, numpy as np, trimesh
dev_p, body_p, carrier_p, back_t, recess = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
m = trimesh.load(dev_p, force='mesh')
parts = [p for p in m.split(only_watertight=False) if p.bounds[0][2] > -30]   # first copy: housing + 3 buttons
dev = trimesh.util.concatenate(parts)
V = dev.vertices.copy()
# device frame (X thickness, Y up with USB at -Y, Z sideways) -> holder frame (x sideways, y up, z from wall)
dev.vertices = np.c_[V[:, 2], V[:, 1], V[:, 0] + back_t]
body = trimesh.load(body_p, force='mesh'); car = trimesh.load(carrier_p, force='mesh'); car.apply_translation([0, 0, recess])
print('watertight', body.is_watertight, car.is_watertight, 'device pts')
rng = np.random.default_rng(1)
pts, _ = trimesh.sample.sample_surface(dev, 150000, seed=1)
pts = np.vstack([pts, dev.vertices])
for name, mesh in (('body', body), ('carrier', car)):
    print(name)
    for lift in (0, 0.5, 1, 2, 4, 6.35, 8, 12, 16, 20, 26, 32, 40):
        q = pts + [0, lift, 0]
        box = (q >= mesh.bounds[0] - 1).all(1) & (q <= mesh.bounds[1] + 1).all(1)
        qq = q[box]
        inside = mesh.contains(qq)
        line = f'  lift {lift:5.2f} mm: {int(inside.sum())} of {len(qq)} nearby device points inside'
        if lift == 0:
            sd = trimesh.proximity.signed_distance(mesh, qq[::4])   # positive = inside
            i = sd.argmax(); line += f'; smallest gap {-sd[i]:.3f} mm at {np.round(qq[::4][i], 2).tolist()}'
        if inside.any():
            w = qq[inside]; line += f'; worst region around {np.round(w.mean(0), 2).tolist()} extent {np.round(np.ptp(w, axis=0), 2).tolist()}'
        print(line)
