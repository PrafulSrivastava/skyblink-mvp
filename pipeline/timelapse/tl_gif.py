"""Render an animated GIF of a target's time-lapse (frames, predicted track, fitted trail, date)."""
import json, sys
from PIL import Image, ImageDraw, ImageFont
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 30); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 15)
def gif(t, b, out):
    d = json.load(open(f'/workspace/skyblink-data/{t}/timelapse/timelapse.json')); fr = d['bands'][b]['frames']; S = 10; W = 49 * S
    track = [((p[1] + .5) * S, (p[2] + .5) * S) for p in d['track']['points']]
    ims = []
    for k, f in enumerate(fr):
        im = Image.open(f'/workspace/skyblink-data/{t}/' + f['path']).convert('RGB').resize((W, W), 0)
        can = Image.new('RGB', (W, W + 70), (10, 13, 20)); can.paste(im, (0, 0)); dr = ImageDraw.Draw(can)
        dr.line(track, fill=(189, 163, 139), width=2)
        past = [((g['centroid']['png_x'] + .5) * S, (g['centroid']['png_y'] + .5) * S) for g in fr[:k + 1]]
        if len(past) > 1: dr.line(past, fill=(233, 237, 243), width=2)
        for j, (x, y) in enumerate(past[:-1]):
            a = int(60 + 170 * (j + 1) / len(past)); dr.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(a, a, a))
        x, y = past[-1]; dr.ellipse([x - 23, y - 23, x + 23, y + 23], outline=(90, 185, 252), width=3)
        dr.text((W / 2, W + 22), f['date'], fill=(233, 237, 243), font=F, anchor='mm')
        lab = 'SPHEREx' if f['kind'] == 'spherex' else f'unWISE {b}  pass {k + 1}/{len(fr) - 1}'
        dr.text((W / 2, W + 54), lab + f'   {d["name"]}', fill=(130, 134, 141), font=f2, anchor='mm')
        ims.append(can)
    ims[0].save(out, save_all=True, append_images=ims[1:], duration=[450] * (len(ims) - 1) + [1600], loop=0, optimize=True)
if __name__ == '__main__':
    gif('barnards-star', 'W2', '/workspace/time-lapse/barnard.gif')
    for t in ['eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']: gif(t, 'W2', f'/workspace/time-lapse/{t}-W2.gif')
