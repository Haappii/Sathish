"""Health check endpoint tests."""


def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_health_no_auth_required(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
