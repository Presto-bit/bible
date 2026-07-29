"""随机用户名生成单测。"""
from app.auth.random_username import (
    PREFIXES,
    SUFFIXES,
    generate_random_username,
    is_generated_username,
    validate_username,
)
import pytest


def test_generate_random_username_format():
    for _ in range(32):
        name = generate_random_username()
        assert any(name.startswith(p) for p in PREFIXES)
        assert any(name.endswith(s) for s in SUFFIXES)
        assert 4 <= len(name) <= 12
        assert is_generated_username(name)


def test_is_generated_username_with_digit_suffix():
    assert is_generated_username("喜乐的旅人12")
    assert not is_generated_username("我的自定义昵称")
    assert not is_generated_username("12345678")


def test_validate_username():
    assert validate_username("  书友小安  ") == "书友小安"
    with pytest.raises(ValueError):
        validate_username("a")
    with pytest.raises(ValueError):
        validate_username("12345678")
