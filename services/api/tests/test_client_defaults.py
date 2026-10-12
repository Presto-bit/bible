from app.content.client_defaults import client_defaults_payload


def test_client_defaults_zero_guilt_and_dnd():
    d = client_defaults_payload()
    assert d["reminders"]["daily_reading_enabled_default"] is False
    assert d["reminders"]["reading_dnd_default"] is True
    assert d["discover"]["tab_bar_unread_badge"] is False
    assert d["home"]["rail_slot_max"] == 4
    assert d["copy"]["guilt_free"] is True
