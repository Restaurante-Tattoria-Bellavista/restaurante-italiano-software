from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.errors import BusinessError

app = create_app()

@app.get("/_test/conflict")
def conflict():
    raise BusinessError("Conflicto de prueba")

@app.get("/_test/not-found")
def not_found():
    raise HTTPException(status_code=404, detail="No existe")

client = TestClient(app)


def test_conflict_format():
    response = client.get("/_test/conflict")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "business_error"


def test_not_found_format():
    response = client.get("/_test/not-found")
    assert response.status_code == 404
    assert response.json()["error"]["message"] == "No existe"
