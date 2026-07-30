## Source

- Translation: `contemporary`
- Upstream title: `Biblica(R) Open Chinese Contemporary Bible (Simplified Script)`
- Source page: <https://ebible.org/find/show.php?id=cmncbs>
- Download used: <https://eBible.org/Scriptures/cmncbs_vpl.zip>
- Imported file: `cmncbs_vpl.txt`
- Imported on: `2026-07-29`

## License

- `CC BY-SA 4.0`
- Copyright notice and source attribution must be preserved.
- If text is modified or adapted, derivative distribution must remain under the same license.
- `Biblica` trademark usage remains subject to Biblica requirements.

## Local build outputs

- `data/bible/contemporary/verses.json`
- `build/bible_contemporary.sqlite`

## Book id note

Upstream VPL uses alternate codes (`JOH`, `MAR`, `PHI`, …). Import normalizes them to
project canonical ids (`JHN`, `MRK`, `PHP`, …) via `scripts/import_bible.py` aliases,
matching cuvs/cnv/kjv so `/bible/chapter?book=JHN&version=contemporary` resolves.
