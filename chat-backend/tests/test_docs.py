"""The API docs map every route, so outside development they must not exist."""

from app.main import app


def test_api_docs_are_off_outside_dev():
    # pytest runs without ENV=dev, the same as a production server.
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None