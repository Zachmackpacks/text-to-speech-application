from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_shape():
    client = TestClient(app)
    response = client.get('/api/health')

    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'whisper' in data
    assert {'device', 'model_size', 'compute_type'} <= set(data['whisper'].keys())
    assert isinstance(data['llm_configured'], bool)
    assert isinstance(data['llm_configured'], bool)

