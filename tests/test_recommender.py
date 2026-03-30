import os
import pytest

# Set env vars before any import that triggers config loading
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("APP_USERNAME", "test")
os.environ.setdefault("APP_PASSWORD", "test")
os.environ.setdefault("SESSION_SECRET", "test-secret")

from recommender import (
    DescriptorRequest,
    build_user_prompt,
    _cache_key,
    _cache_get,
    _cache_set,
    PREDICTABILITY_LABELS,
    SHARPNESS_LABELS,
    ELASTICITY_LABELS,
    RISK_LABELS,
)


def make_req(**overrides) -> DescriptorRequest:
    defaults = {
        "tempo_feel": "Medium",
        "phrase_predictability": 3,
        "break_behavior": ["Clear breaks"],
        "accent_sharpness": 3,
        "elasticity_potential": 3,
        "risk_level": 2,
        "emotional_tone": ["Playful"],
        "genre": [],
        "additional_context": "",
    }
    defaults.update(overrides)
    return DescriptorRequest(**defaults)


# ── build_user_prompt() ────────────────────────────────────────

class TestBuildUserPrompt:
    def test_tempo_in_prompt(self):
        prompt = build_user_prompt(make_req(tempo_feel="Slow"))
        assert "TEMPO FEEL: Slow" in prompt

    def test_predictability_label_in_prompt(self):
        prompt = build_user_prompt(make_req(phrase_predictability=5))
        assert PREDICTABILITY_LABELS[5] in prompt
        assert "5/5" in prompt

    def test_break_behavior_in_prompt(self):
        prompt = build_user_prompt(make_req(break_behavior=["Fake breaks", "Micro-pauses"]))
        assert "Fake breaks" in prompt
        assert "Micro-pauses" in prompt

    def test_accent_sharpness_label(self):
        prompt = build_user_prompt(make_req(accent_sharpness=1))
        assert SHARPNESS_LABELS[1] in prompt

    def test_elasticity_label(self):
        prompt = build_user_prompt(make_req(elasticity_potential=4))
        assert ELASTICITY_LABELS[4] in prompt

    def test_risk_label(self):
        prompt = build_user_prompt(make_req(risk_level=5))
        assert RISK_LABELS[5] in prompt

    def test_emotional_tone_in_prompt(self):
        prompt = build_user_prompt(make_req(emotional_tone=["Dark", "Cinematic"]))
        assert "Dark" in prompt
        assert "Cinematic" in prompt

    def test_genre_all_when_empty(self):
        prompt = build_user_prompt(make_req(genre=[]))
        assert "All genres" in prompt

    def test_genre_specific(self):
        prompt = build_user_prompt(make_req(genre=["Blues", "Neo-Soul"]))
        assert "Blues" in prompt
        assert "Neo-Soul" in prompt

    def test_additional_context_included(self):
        prompt = build_user_prompt(make_req(additional_context="  Competition finals  "))
        assert "Competition finals" in prompt

    def test_additional_context_excluded_when_empty(self):
        prompt = build_user_prompt(make_req(additional_context=""))
        assert "ADDITIONAL CONTEXT" not in prompt


# ── _cache_key() ──────────────────────────────────────────────

class TestCacheKey:
    def test_same_key_for_equivalent_requests(self):
        req1 = make_req(
            break_behavior=["Clear breaks", "Fake breaks"],
            emotional_tone=["Playful", "Dark"],
            genre=["Blues", "Pop"],
        )
        req2 = make_req(
            break_behavior=["Fake breaks", "Clear breaks"],  # reversed
            emotional_tone=["Dark", "Playful"],              # reversed
            genre=["Pop", "Blues"],                          # reversed
        )
        assert _cache_key(req1) == _cache_key(req2)

    def test_different_key_for_different_tempo(self):
        assert _cache_key(make_req(tempo_feel="Slow")) != _cache_key(make_req(tempo_feel="Fast"))

    def test_additional_context_normalized(self):
        req1 = make_req(additional_context="  Hello World  ")
        req2 = make_req(additional_context="hello world")
        assert _cache_key(req1) == _cache_key(req2)

    def test_returns_32_char_hex(self):
        key = _cache_key(make_req())
        assert len(key) == 32
        assert all(c in "0123456789abcdef" for c in key)

    def test_different_sliders_produce_different_keys(self):
        assert _cache_key(make_req(risk_level=1)) != _cache_key(make_req(risk_level=5))


# ── Markdown fence stripping ───────────────────────────────────

class TestMarkdownFenceStripping:
    """Tests the raw_text fence-stripping logic from recommender.py, extracted as a helper."""

    def strip_fences(self, raw_text: str) -> str:
        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```", 2)[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.rsplit("```", 1)[0].strip()
        return raw_text

    def test_plain_json_unchanged(self):
        raw = '{"key": "value"}'
        assert self.strip_fences(raw) == raw

    def test_backtick_fence_stripped(self):
        result = self.strip_fences('```\n{"key": "value"}\n```')
        assert result == '{"key": "value"}'

    def test_json_labeled_fence_stripped(self):
        result = self.strip_fences('```json\n{"key": "value"}\n```')
        assert result == '{"key": "value"}'

    def test_whitespace_trimmed(self):
        result = self.strip_fences('```json\n  {"key": "value"}  \n```')
        assert result == '{"key": "value"}'

    def test_no_fence_returns_stripped_text(self):
        result = self.strip_fences('  {"key": "value"}  ')
        assert result == '{"key": "value"}'


# ── SQLite cache hit/miss ─────────────────────────────────────

class TestSQLiteCache:
    @pytest.fixture(autouse=True)
    def temp_db(self, monkeypatch, tmp_path):
        db_file = str(tmp_path / "test_cache.db")
        import config
        monkeypatch.setattr(config.settings, "db_path", db_file)

    def test_cache_miss_returns_none(self):
        assert _cache_get("cache", "nonexistent") is None

    def test_cache_set_then_get(self):
        data = {"recommendations": [{"title": "Test", "artist": "Artist"}]}
        _cache_set("cache", "k1", data)
        assert _cache_get("cache", "k1") == data

    def test_similar_cache_independent(self):
        _cache_set("cache", "shared", {"source": "recommend"})
        assert _cache_get("similar_cache", "shared") is None

    def test_similar_cache_set_then_get(self):
        data = {"recommendations": [], "curator_note": "note"}
        _cache_set("similar_cache", "sim1", data)
        assert _cache_get("similar_cache", "sim1") == data

    def test_cache_overwrite(self):
        _cache_set("cache", "k2", {"v": 1})
        _cache_set("cache", "k2", {"v": 2})
        assert _cache_get("cache", "k2") == {"v": 2}

    def test_invalid_table_raises(self):
        with pytest.raises(AssertionError):
            _cache_get("bad_table", "key")
