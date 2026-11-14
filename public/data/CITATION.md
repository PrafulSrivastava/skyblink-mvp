# Data credits and citation

## SPHEREx (NASA)
This bundle uses SPHEREx Level-2 spectral images: DR1 images, plus QR3 images where IRSA's SIA service returned them for a target. They were read from the public AWS bucket `s3://nasa-irsa-spherex`, which IRSA operates.

- SPHEREx Data Release 1 (DR1) Spectral Images: doi:10.26131/IRSA678 (https://doi.org/10.26131/IRSA678)
- SPHEREx Data Release 1 (DR1) Spectral All-Sky Cube: doi:10.26131/IRSA679 (https://doi.org/10.26131/IRSA679). Cite this if the app shows the DR1 all-sky HiPS cube; the bundle itself does not use it.
- SPHEREx Quick Release 3 (QR3) Spectral Images: doi:10.26131/IRSA662. IRSA's QR overview page gives this DOI; cite it because some frames come from `spherex_qr3`.

Required acknowledgement:
> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

IRSA: this research made use of the NASA/IPAC Infrared Science Archive, which is funded by NASA and operated by the California Institute of Technology.

## Gaia (ESA)
> This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.

Gaia DR3: Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1. Used for the astrometry of Barnard's Star, Eps Indi B, RW Aur and R Dra, and for the comparison stars.

## CatWISE2020 (NASA WISE/NEOWISE, via IRSA)
Used for the WISE 0855 proper motion: Marocco et al. 2021, ApJS 253, 8, doi:10.26131/IRSA551.

## Software
astropy, astroquery, pyvo, numpy, scipy, Pillow.
