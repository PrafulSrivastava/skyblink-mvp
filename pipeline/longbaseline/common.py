import numpy as np, warnings, json
warnings.filterwarnings('ignore')
import astropy.units as u
from astropy.coordinates import SkyCoord, Distance, get_body_barycentric, CartesianRepresentation
from astropy.time import Time
from astropy.utils import iers
iers.conf.auto_download = True

TARGETS = {
 "barnards-star": dict(name="Barnard's Star", default_band="D2", src="gaia", gaia_id=4472832130942575872,
     input_coord="17h57m48.5s +04d41m36s (SIMBAD J2000; brief gives name only)"),
 "eps-indi-b": dict(name="Epsilon Indi B", default_band="D3", src="gaia", gaia_id=6412596012146801152,
     input_coord="22h04m10.52s -56d46m57.7s (J2000, name only in brief)"),
 "wise-0855": dict(name="WISE J085510.83-071442.5", default_band="D6", src="catwise",
     catwise_name="J085507.96-071439.3", input_coord="08h55m10.831s -07d14m42.53s (as given in the challenge brief)"),
 "rw-aur": dict(name="RW Aurigae", default_band="D2", src="gaia", gaia_id=156430822114424576,
     input_coord="05h07m49.54s +30d24m05.1s (J2000, name only in brief)"),
 "r-dra": dict(name="R Draconis", default_band="D2", src="gaia", gaia_id=1648328016354496384,
     input_coord="16h32m40.17s +66d45m17.9s (J2000, name only in brief)"),
}

def star_coord(cat):
    """cat: dict with ra,dec(deg) at ref_epoch (Time), pmra(cosdec), pmdec mas/yr, parallax mas or None, rv km/s or None"""
    kw = dict(ra=cat['ra']*u.deg, dec=cat['dec']*u.deg, pm_ra_cosdec=cat['pmra']*u.mas/u.yr,
              pm_dec=cat['pmdec']*u.mas/u.yr, obstime=Time(cat['ref_epoch_mjd'], format='mjd', scale='tcb'))
    if cat.get('parallax') and cat['parallax'] > 0:
        kw['distance'] = Distance(parallax=cat['parallax']*u.mas)
    else:
        kw['distance'] = 1e4*u.pc  # placeholder far distance only to allow space motion; parallax effect then ~0
    kw['radial_velocity'] = (cat.get('rv') or 0.0)*u.km/u.s
    return SkyCoord(frame='icrs', **kw)

def position_at(c0, mjd, use_parallax=True):
    """Return (ra,dec) deg at MJD (UTC) as seen from the geocentre (SPHEREx LEO offset negligible)."""
    t = Time(mjd, format='mjd', scale='utc')
    c1 = c0.apply_space_motion(new_obstime=t)
    if not use_parallax:
        return c1.ra.deg, c1.dec.deg
    s = c1.cartesian.xyz.to(u.au)
    e = get_body_barycentric('earth', t).xyz.to(u.au)
    d = s - e
    rep = CartesianRepresentation(d)
    cc = SkyCoord(rep, frame='icrs')
    return cc.ra.deg, cc.dec.deg
