"""每日经文互动数据在用户 ID 切换时迁移（设备绑定 / 登录）。"""
from __future__ import annotations

from ..auth.user_code import is_user_code


def migrate_daily_verse_engagement(conn, from_code: str, to_code: str) -> int:
    """将点赞/分享从旧 user_code 迁到当前账号；返回迁移的点赞行数。"""
    src = (from_code or "").strip()
    dst = (to_code or "").strip()
    if not is_user_code(src) or not is_user_code(dst) or src == dst:
        return 0
    conn.execute(
        """
        DELETE FROM daily_verse_like AS old
        USING daily_verse_like AS tgt
        WHERE old.user_code = %s AND tgt.user_code = %s
          AND old.verse_day = tgt.verse_day
        """,
        (src, dst),
    )
    cur = conn.execute(
        "UPDATE daily_verse_like SET user_code = %s WHERE user_code = %s",
        (dst, src),
    )
    likes_moved = cur.rowcount or 0
    conn.execute(
        "UPDATE daily_verse_share SET user_code = %s WHERE user_code = %s",
        (dst, src),
    )
    return likes_moved
