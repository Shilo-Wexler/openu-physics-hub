"""ENV and the DEV_AUTH_EMAIL guard in app.config."""

import pytest

from app import config


def test_env_defaults_to_prod_when_unset(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    assert config._environment() == "prod"


def test_env_defaults_to_prod_when_empty(monkeypatch):
    monkeypatch.setenv("ENV", "  ")
    assert config._environment() == "prod"


def test_env_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("ENV", "Dev")
    assert config._environment() == "dev"


def test_unknown_env_is_rejected(monkeypatch):
    monkeypatch.setenv("ENV", "staging")
    with pytest.raises(RuntimeError, match="ENV must be one of"):
        config._environment()


def test_dev_auth_email_is_refused_outside_dev(monkeypatch):
    monkeypatch.setenv("DEV_AUTH_EMAIL", "admin@test.com")
    with pytest.raises(RuntimeError, match="only when ENV=dev"):
        config._dev_auth_email("prod")


def test_dev_auth_email_is_allowed_in_dev(monkeypatch):
    monkeypatch.setenv("DEV_AUTH_EMAIL", " Admin@Test.com ")
    assert config._dev_auth_email("dev") == "admin@test.com"


def test_no_dev_auth_email_is_fine_in_prod(monkeypatch):
    monkeypatch.setenv("DEV_AUTH_EMAIL", "")
    assert config._dev_auth_email("prod") is None
    