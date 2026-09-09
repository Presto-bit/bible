from app.content import loader


def test_paragraph_ranges_jhn3():
    ranges = loader.paragraph_ranges("JHN", 3)
    assert len(ranges) == 3
    assert ranges[0] == [1, 21]
    assert ranges[1] == [22, 30]
    assert ranges[-1] == [31, 36]


def test_paragraph_ranges_psalm_poetry():
    ranges = loader.paragraph_ranges("PSA", 23)
    assert len(ranges) == 6
    assert ranges[0] == [1, 1]
    assert ranges[-1] == [6, 6]


def test_paragraph_ranges_gen1():
    ranges = loader.paragraph_ranges("GEN", 1)
    assert ranges == [[1, 25], [26, 31]]


def test_paragraph_ranges_2co12():
    ranges = loader.paragraph_ranges("2CO", 12)
    assert len(ranges) == 6
    assert ranges == [[1, 6], [7, 10], [11, 13], [14, 15], [16, 18], [19, 21]]


def test_paragraph_ranges_index():
    idx = loader.paragraph_ranges_index()
    assert "GEN.1" in idx
    assert len(idx) >= 1180


def test_paragraph_ranges_mat5_beatitudes():
    """登山宝训八福：3–12 节逐节成段（discourse L4）。"""
    ranges = loader.paragraph_ranges("MAT", 5)
    assert ranges[0] == [1, 2]
    assert ranges[1] == [3, 3]
    assert ranges[10] == [12, 12]
    assert [3, 3] in ranges
    assert [10, 10] in ranges


def test_paragraph_ranges_isa5_woes():
    ranges = loader.paragraph_ranges("ISA", 5)
    assert [8, 8] in ranges
    assert [25, 25] in ranges


def test_discourse_ranges_index():
    data = loader.discourse_ranges_index()
    assert data.get("schema") == "discourse_line@1"
    entries = data.get("entries") or []
    assert len(entries) >= 15
    refs = {e["ref"] for e in entries}
    assert "MAT.5" in refs
    assert "MAT.1" in refs
    assert "GEN.5" in refs
    assert "REV.2" in refs


def test_paragraph_ranges_mat5_antithesis():
    ranges = loader.paragraph_ranges("MAT", 5)
    assert [21, 21] in ranges
    assert [48, 48] in ranges


def test_poetry_lines_index():
    data = loader.poetry_lines_index()
    assert data.get("schema") == "poetry_lines@1"
    verses = data.get("verses") or {}
    assert "PSA.23.1" in verses
    assert len(verses["PSA.23.1"]) >= 2
