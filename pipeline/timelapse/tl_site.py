"""Copy the time-lapse bundle into the static site; frames upscaled 20x (nearest neighbour) like lb_site.py.
Masks stay in /workspace/skyblink-data (the site draws saturated cores white already)."""
import os, sys, shutil, glob, json
from PIL import Image
SRC = "/workspace/skyblink-data"; SITE = sys.argv[1] if len(sys.argv) > 1 else "/workspace/taste-pass/site"
shutil.copy(f"{SRC}/timelapse.json", f"{SITE}/data/timelapse.json")
for t in ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']:
    dst = f"{SITE}/data/{t}/timelapse"; shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
    shutil.copy(f"{SRC}/{t}/timelapse/timelapse.json", dst)
    for b in ('W1', 'W2'):
        os.makedirs(f"{dst}/{b}")
        for p in sorted(glob.glob(f"{SRC}/{t}/timelapse/{b}/f*.png")):
            Image.open(p).resize((980, 980), Image.NEAREST).save(f"{dst}/{b}/{os.path.basename(p)}", optimize=True)
print('ok')
