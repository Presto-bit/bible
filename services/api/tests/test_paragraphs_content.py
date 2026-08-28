from app.content import loader


def test_paragraph_ranges_jhn3():
    ranges = loader.paragraph_ranges("JHN", 3)
    assert len(ranges) == 3
    assert ranges[0] == [1, 21]
    assert ranges[1] == [22, 30]
    assert ranges[-1] == [31, 36]


def test_paragraph_ranges_psalm_poetry():
    ranges = loader.paragraph_ranges("PSA", 23)
    # USFM \\p：整首为一个出版段落
    assert len(ranges) == 1
    assert ranges[0] == [1, 6]


def test_paragraph_ranges_index():
    idx = loader.paragraph_ranges_index()
    assert "GEN.1" in idx
    assert len(idx) >= 1180
