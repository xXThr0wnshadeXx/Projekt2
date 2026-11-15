from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router
from backend.app.spoken_ambiguity import fraction_ambiguity
from backend.app.mathcheck import validate_latex


@pytest.mark.parametrize('phrase', [
    'x plus one over two', 'X PLUS 1 OVER 2.', 'a minus b over c',
])
def test_unmarked_fraction_grouping_always_asks(phrase):
    models = AsyncMock()
    validate = AsyncMock(return_value=True)
    app = FastAPI()
    app.include_router(spoken_router(models, validate))
    with TestClient(app) as client:
        response = client.post('/api/spoken-to-latex', json={'text': phrase})
    assert response.status_code == 200
    result = response.json()
    assert result['ambiguous'] is True
    assert result['latex'] is None
    assert len(result['alternatives']) == 2
    assert validate.await_count == 2
    models.interpret.assert_not_awaited()


def test_fraction_choices_preserve_both_interpretations():
    result = fraction_ambiguity('x plus one over two')
    assert [choice['latex'] for choice in result['alternatives']] == [
        r'\frac{x+1}{2}', r'x+\frac{1}{2}',
    ]


def test_ambiguity_choices_validate_with_real_cas():
    app = FastAPI()
    app.include_router(spoken_router(AsyncMock(), validate_latex))
    with TestClient(app) as client:
        response = client.post('/api/spoken-to-latex', json={'text': 'x plus one over two'})
    assert response.status_code == 200
    assert response.json()['ambiguous'] is True
    assert [choice['valid'] for choice in response.json()['alternatives']] == [True, True]


@pytest.mark.parametrize('phrase', [
    'x plus the fraction one over two end fraction',
    'two x equals eight', 'square root of x plus one', 'x plus one over two equals three',
])
def test_other_phrases_remain_with_model_interpretation(phrase):
    assert fraction_ambiguity(phrase) is None


@pytest.mark.parametrize('phrase', [
    'x plus one all over two',
    'X PLUS ONE ALL OVER TWO.',
    'the square root of x plus one all over two equals five',
])
def test_all_over_already_groups_the_numerator(phrase):
    assert fraction_ambiguity(phrase) is None
