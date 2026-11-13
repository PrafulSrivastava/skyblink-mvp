"""Write data/longbaseline/index.json: per-target honest labels for the long-baseline mode."""
import json
OUT = "/workspace/skyblink-data"
T = ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']
SHORT = {'barnards-star': "Barnard's Star", 'eps-indi-b': 'ε Indi B', 'wise-0855': 'WISE 0855', 'rw-aur': 'RW Aur', 'r-dra': 'R Dra'}
LABELS = {
 'barnards-star': [dict(kind='warn', text='Saturated core masked in the SPHEREx frame', bands=['W1', 'W2'])],
 'eps-indi-b': [dict(kind='info', text='The diagonal streak in the 2010 frames is a WISE artefact from bright ε Indi A, just west of the field, not a moving source', bands=['W1', 'W2'])],
 'wise-0855': [dict(kind='warn', text='Blended with a Gaia field star at short wavelengths: at 2.9 to 3.8 µm the SPHEREx light at the 2025 position is partly that star', bands=['W1']),
               dict(kind='warn', text='Barely detected by WISE in W1 in 2010 (peak S/N about 7). Use W2, where it is clear in both epochs', bands=['W1']),
               dict(kind='info', text='A G=16.3 Gaia star sits 8″ from the 2025 position and adds some light at 4 to 5 µm', bands=['W2'])],
 'rw-aur': [dict(kind='info', text='No visible motion expected: 0.5″ in 16 years (0.07 px). RW Aur is a variable young star, so brightness differences are real', bands=['W1', 'W2']),
            dict(kind='warn', text='Saturated core masked in the SPHEREx frame', bands=['W1'])],
 'r-dra': [dict(kind='info', text='No visible motion expected: 0.3″ in 16 years (0.06 px). R Dra is a Mira variable', bands=['W1', 'W2']),
           dict(kind='warn', text='Saturated core masked in the SPHEREx frame', bands=['W1', 'W2'])],
}
DEFAULT = {t: 'W2' for t in T}
idx = dict(version=1, mode='long-baseline', title='Long baseline (WISE 2010 vs SPHEREx 2025 to 2026)',
           band_note='WISE W1 (3.4 µm) and W2 (4.6 µm) are broad filters; the SPHEREx side stacks its 2.9 to 3.8 µm and 4.0 to 5.0 µm channels, so brightness and colour differ a little but positions do not.',
           normalisation='Each image is stretched between its own 10th and 99.5th percentile (asinh), because WISE counts and SPHEREx MJy/sr are different units.',
           targets=[])
for t in T:
    d = json.load(open(f"{OUT}/{t}/longbaseline/longbaseline.json"))
    idx['targets'].append(dict(id=t, name=d['name'], short=SHORT[t], default_band=DEFAULT[t], data=f"{t}/longbaseline/longbaseline.json", labels=LABELS[t]))
json.dump(idx, open(f"{OUT}/longbaseline.json", 'w'), indent=1, ensure_ascii=False)
print('ok')
