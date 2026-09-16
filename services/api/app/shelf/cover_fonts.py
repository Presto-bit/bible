"""书架封面叠字字体：仅允许 CJK 字体，禁止回退到 DejaVu/默认字体（避免方框 tofu）。"""
from __future__ import annotations

from pathlib import Path

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

_BUNDLED = [
    _ASSETS_DIR / "NotoSansSC-Bold.otf",
    _ASSETS_DIR / "NotoSansSC-Regular.otf",
]

_SYSTEM_BOLD = [
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
]

_SYSTEM_REGULAR = [
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
]


def _font_renders_cjk(font) -> bool:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (80, 80))
    draw = ImageDraw.Draw(img)
    try:
        bbox = draw.textbbox((0, 0), "彼爱", font=font)
    except Exception:
        return False
    return (bbox[2] - bbox[0]) > 4


def load_cover_font(size: int, *, bold: bool = True):
    """加载封面用字体；找不到 CJK 字体时抛错，不用缺字回退。"""
    from PIL import ImageFont

    paths = list(_BUNDLED) + (_SYSTEM_BOLD if bold else _SYSTEM_REGULAR)
    for path in paths:
        if not path.is_file():
            continue
        try:
            font = ImageFont.truetype(str(path), size=size)
        except OSError:
            continue
        if _font_renders_cjk(font):
            return font

    raise OSError(
        "书架封面缺少可用的中日韩字体。"
        "生产镜像请安装 fonts-noto-cjk，或将 NotoSansSC-Bold.otf 放入 services/api/assets/fonts/"
    )
