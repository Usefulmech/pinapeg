from datetime import UTC, datetime
from app.schemas import CaptureTextRequest
from app.services import make_proposal

def test_dated_capture_becomes_create():
    proposal = make_proposal("test-user", CaptureTextRequest(text="Book design sync Friday at 10", local_datetime=datetime(2026, 7, 16, 9, tzinfo=UTC)))
    assert proposal.intent == "CREATE"
    assert proposal.datetime is not None

def test_unstructured_capture_becomes_open_thought():
    proposal = make_proposal("other-user", CaptureTextRequest(text="I should revisit the vendor contract issue", local_datetime=datetime.now(UTC)))
    assert proposal.intent == "OPEN_THOUGHT"

def test_scholarship_capture_keeps_deadline():
    proposal = make_proposal("scholarship-user", CaptureTextRequest(text="I want to apply for the Google scholarship before October 30", local_datetime=datetime(2026, 7, 18, 9, tzinfo=UTC)))
    assert proposal.intent == "TRACK_SCHOLARSHIP"
    assert proposal.datetime is not None
    assert proposal.datetime.month == 10
    assert proposal.datetime.day == 30

def test_arxiv_capture_becomes_paper():
    proposal = make_proposal("paper-user", CaptureTextRequest(text="Track this research paper: https://arxiv.org/abs/1706.03762", local_datetime=datetime.now(UTC)))
    assert proposal.intent == "TRACK_PAPER"
