"""Detects offensive words (Hebrew and English) in user text.

Whole-word matching against blocked_words.txt, so a bad word hidden inside an
innocent word does not count. Each word is normalized first so simple disguises
still match. Hebrew prefixes (ו, ה, מ...) are deliberately not stripped:
"הזין" (entered) or "מזין" (feeds) would then look like a bad word.
"""

import re
from pathlib import Path

_WORDS_FILE = Path(__file__).with_name("blocked_words.txt")

_NIQQUD = re.compile(r"[֑-ׇ]")
_FINAL_LETTERS = str.maketrans("ךםןףץ", "כמנפצ")
# Everything except digits, English and Hebrew letters: "f.u.c.k" -> "fuck".
_NOT_LETTER = re.compile(r"[^0-9a-zא-ת]")
# Digits and symbols used as letters: "sh1t" -> "shit".
_LOOKALIKES = str.maketrans("0134578@$", "oieastbas")
_HAS_ENGLISH = re.compile(r"[a-z]")
# Three or more of the same character: "fuuuck".
_REPEATS = re.compile(r"(.)\1{2,}")


def _normalize(word: str) -> str:
    word = _NIQQUD.sub("", word.lower()).translate(_FINAL_LETTERS)
    return _NOT_LETTER.sub("", word)


def _variants(word: str) -> set[str]:
    forms = {word}
    # Only words that already have an English letter: "a55" -> "ass", but "455" stays a number.
    if _HAS_ENGLISH.search(word):
        forms.add(word.translate(_LOOKALIKES))
    for form in list(forms):
        forms.add(_REPEATS.sub(r"\1\1", form))  # "asssss" -> "ass"
        forms.add(_REPEATS.sub(r"\1", form))  # "fuuuck" -> "fuck"
    return forms


def _load() -> tuple[frozenset[str], tuple[str, ...]]:
    words, phrases = set(), set()
    for line in _WORDS_FILE.read_text(encoding="utf-8").splitlines():
        parts = [w for w in map(_normalize, line.split("#", 1)[0].split()) if w]
        if len(parts) == 1:
            words.add(parts[0])
        elif parts:
            # Padded with spaces so a phrase only matches whole words.
            phrases.add(f" {' '.join(parts)} ")
    return frozenset(words), tuple(phrases)


# Loaded once at startup; a set lookup per word keeps checks fast on long messages.
_WORDS, _PHRASES = _load()


def contains_profanity(text: str) -> bool:
    words = [w for w in map(_normalize, text.split()) if w]
    if any(form in _WORDS for word in words for form in _variants(word)):
        return True
    joined = f" {' '.join(words)} "
    return any(phrase in joined for phrase in _PHRASES)