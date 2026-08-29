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
