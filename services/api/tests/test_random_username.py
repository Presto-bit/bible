"""随机用户名生成单测。"""
from app.auth.random_username import (
    PREFIXES,
    SUFFIXES,
    generate_random_username,
)


def test_generate_random_username_format():
    for _ in range(32):
        name = generate_random_username()
        assert any(name.startswith(p) for p in PREFIXES)
        assert any(name.endswith(s) for s in SUFFIXES)
        assert 4 <= len(name) <= 12
