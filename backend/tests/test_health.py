from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/health" in paths
    assert "/health/db" in paths


def test_missing_route_has_consistent_contract():
    response = client.get("/no-existe")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_404"


def test_database_error_does_not_disclose_credentials(monkeypatch):
    from app.routers import health
    def unavailable():
        raise RuntimeError("private password")
    monkeypatch.setattr(health, "get_engine", unavailable)
    response = client.get("/health/db")
    assert response.status_code == 503
    assert "private password" not in response.text
    assert response.json()["error"]["code"] == "database_unavailable"
