"""The offensive-word filter on its own, called directly without HTTP."""

import pytest

from app.services.profanity import contains_profanity


@pytest.mark.parametrize(
    "text",
    [
        "fuck this course",
        "FUCK",  # case
        "f.u.c.k",  # symbols between letters
        "fuuuuck",  # repeated letters
        "sh1t",  # digits as letters
        "what an asshole",
        "the lecturer is a b1tch",
        "2 girls 1 cup",  # phrase
    ],
)
def test_blocks_vulgar_words(text):
    assert contains_profanity(text)


@pytest.mark.parametrize(
    "text",
    [
        "great course, highly recommended",
        "I passed the class",  # "ass" inside a word
        "data analysis lab",  # "anal" inside a word
        "Scunthorpe",  # a blocked word inside a place name
        "assignment 455",  # a number that looks like letters
        "this lecturer is an idiot",  # mild insult, allowed on purpose
        "the girls had 1 cup each",  # phrase words, but not together
        "",
    ],
)
def test_allows_clean_text(text):
    assert not contains_profanity(text)