from app.analytics.product_events import (
    EVENT_LABELS,
    PRODUCT_EVENT_NAMES,
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
