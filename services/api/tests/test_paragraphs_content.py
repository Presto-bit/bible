from app.content import loader


def test_paragraph_ranges_jhn3():
    ranges = loader.paragraph_ranges("JHN", 3)
    assert len(ranges) == 9
    assert ranges[0] == [1, 5]
    assert ranges[-1][1] == 36


def test_paragraph_ranges_psalm_poetry():
    ranges = loader.paragraph_ranges("PSA", 23)
    assert len(ranges) == 6
    assert all(start == end for start, end in ranges)


def test_paragraph_ranges_index():
    idx = loader.paragraph_ranges_index()
    assert "GEN.1" in idx
    assert len(idx) >= 1180
