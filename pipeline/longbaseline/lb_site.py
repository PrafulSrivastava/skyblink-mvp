"""Copy the long-baseline bundle into the static site and upscale the display PNGs 20x (nearest neighbour).

The 49x49 PNGs are blown up to 980x980 without interpolation, so each SPHEREx-scale pixel stays a sharp
block on high-DPI screens (the taste gate rejects 10x browser upscaling). Masks and longbaseline.json are
copied unchanged; the science arrays stay in /workspace/skyblink-data.
"""
import os, sys, shutil, glob
from PIL import Image
SRC = "/workspace/skyblink-data"; SITE = sys.argv[1] if len(sys.argv) > 1 else "/workspace/taste-pass/site"
shutil.copy(f"{SRC}/longbaseline.json", f"{SITE}/data/longbaseline.json")
for t in ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']:
    dst = f"{SITE}/data/{t}/longbaseline"; shutil.rmtree(dst, ignore_errors=True); shutil.copytree(f"{SRC}/{t}/longbaseline", dst)
    for p in glob.glob(f"{dst}/W*/*.png"):
        if 'mask' in p: continue
        im = Image.open(p)
        if im.size[0] == 49: im.resize((980, 980), Image.NEAREST).save(p, optimize=True)
print('ok')
