from app.analytics.product_events import (
    EVENT_LABELS,
    EVENT_GROUPS,
    PRODUCT_EVENT_NAMES,
    event_group,
    normalize_event_name,
)


def test_product_events_catalog():
    assert len(PRODUCT_EVENT_NAMES) == 20
    assert set(EVENT_LABELS) == PRODUCT_EVENT_NAMES


def test_normalize_event_name():
    assert normalize_event_name("app_open") == "app_open"
    assert normalize_event_name(" APP_OPEN ") == "app_open"
    assert normalize_event_name("unknown_event") is None
    assert normalize_event_name("") is None


def test_event_groups_cover_catalog():
    covered = set()
    for names in EVENT_GROUPS.values():
        covered.update(names)
    assert covered == PRODUCT_EVENT_NAMES


def test_event_group_mapping():
    assert event_group("listen_open") == "reading"
    assert event_group("prayer_finish") == "spiritual"
    assert event_group("shelf_checkin") == "content"
    assert event_group("ai_ask") == "growth"
