"""Write data/timelapse.json: the index of the time-lapse mode with per-target honest labels and epoch summaries."""
import json
OUT = "/workspace/skyblink-data"
T = ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']
SHORT = {'barnards-star': "Barnard's Star", 'eps-indi-b': 'ε Indi B', 'wise-0855': 'WISE 0855', 'rw-aur': 'RW Aur', 'r-dra': 'R Dra'}
SAT = 'Saturated core: unWISE leaves a few hollow pixels at the centre of very bright stars. They are drawn white here and left out of the fits'
LABELS = {
 'barnards-star': [dict(kind='info', text=SAT, bands=['W1', 'W2'])],
 'eps-indi-b': [dict(kind='info', text='The diagonal streak and the bright ring at the top right in every other frame are WISE artefacts from bright ε Indi A just outside the field. They follow the scan direction and are not moving sources', bands=['W1', 'W2'])],
 'wise-0855': [dict(kind='warn', text='Barely detected in W1: the fitted position wanders up to 3 px from the prediction in faint frames, so the trail falls back to the prediction there. Use W2', bands=['W1']),
               dict(kind='info', text='A G=16.3 Gaia star sits 8″ from the 2025 position and adds some light to the SPHEREx frame', bands=['W2'])],
 'rw-aur': [dict(kind='info', text='No visible motion expected: under 0.5″ in 16 years. RW Aur is a variable young star, so the brightness changes are real', bands=['W1', 'W2']),
            dict(kind='info', text=SAT, bands=['W1', 'W2'])],
 'r-dra': [dict(kind='info', text='No visible motion expected: 0.3″ in 16 years. R Dra is a Mira variable, so it brightens and fades on a 245-day cycle', bands=['W1', 'W2']),
           dict(kind='warn', text='Heavily saturated: the hollow core is drawn white and the Gaussian fit is unreliable, so the trail uses the Gaia prediction in most frames', bands=['W1', 'W2'])],
}
idx = dict(version=1, mode='time-lapse', title='Time-lapse: every WISE and NEOWISE pass from 2010 to 2024, then SPHEREx',
           source='unWISE time-resolved coadds (Meisner et al. 2018, 2023; neo11 epochs) cut out through the WiseView service (Caselden et al. 2018). One coadd per sky pass, about every six months. The last frame is the SPHEREx stack from the long-baseline mode.',
           normalisation='All unWISE frames of a target share one asinh stretch (the median over epochs of each frame\'s 10th and 99.5th percentile), so field stars keep a steady brightness. The SPHEREx frame is in MJy/sr and is stretched on its own.',
           band_note='W1 is 3.4 µm and W2 is 4.6 µm. The SPHEREx frame stacks its 2.9 to 3.8 µm (W1) or 4.0 to 5.0 µm (W2) channels.',
           targets=[])
for t in T:
    d = json.load(open(f"{OUT}/{t}/timelapse/timelapse.json"))
    summ = {}
    for b, bd in d['bands'].items():
        fr = bd['frames']; uw = [f for f in fr if f['kind'] == 'unwise']
        summ[b] = dict(n_frames=len(fr), n_unwise=len(uw), first=fr[0]['date'], last_unwise=uw[-1]['date'], last=fr[-1]['date'],
                       n_fit_centroids=sum(1 for f in fr if f['centroid']['source'] == 'fit'))
    idx['targets'].append(dict(id=t, name=d['name'], short=SHORT[t], default_band='W2', data=f"{t}/timelapse/timelapse.json", labels=LABELS[t], summary=summ))
json.dump(idx, open(f"{OUT}/timelapse.json", 'w'), indent=1, ensure_ascii=False)
print(json.dumps({x['id']: x['summary'] for x in idx['targets']}, indent=0))
