import asyncio
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from recognize import FragmentClient, RecognitionError, RateLimitError, result_from_response


class FakeResponse:
    def __init__(self, status):
        self.status = status
        self.headers = {}
    async def __aenter__(self):
        return self
    async def __aexit__(self, *args):
        pass


class FakeSession:
    def __init__(self, status):
        self.status, self.calls = status, 0
    def request(self, *args, **kwargs):
        self.calls += 1
        return FakeResponse(self.status)


class EngineChecks(unittest.TestCase):
    def test_fragmented_http_body_is_fully_read_before_json(self):
        payload = json.dumps({'matches': [], 'name': 'Música' * 3000}, ensure_ascii=False).encode()
        class Content:
            async def iter_chunked(self, size):
                for i in range(0, len(payload), 7):
                    yield payload[i:i+7]
        response = FakeResponse(200); response.content = Content()
        session = FakeSession(200); session.request = lambda *a, **kw: response
        result = asyncio.run(FragmentClient(session).request('POST', 'https://amp.shazam.com/test'))
        self.assertEqual(result['name'], 'Música' * 3000)

    def test_streamed_body_keeps_size_limit_and_invalid_json_is_explicit(self):
        for payload, expected in [(b'x' * 1_048_577, 'demasiado grande'), (b'{"matches": [', 'incompleta o inválida')]:
            class Content:
                async def iter_chunked(self, size):
                    for i in range(0, len(payload), size): yield payload[i:i+size]
            response = FakeResponse(200); response.content = Content()
            session = FakeSession(200); session.request = lambda *a, **kw: response
            with self.assertRaisesRegex(RecognitionError, expected):
                asyncio.run(FragmentClient(session).request('POST', 'https://amp.shazam.com/test'))

    def test_server_cooldown_is_never_shortened(self):
        self.assertEqual(RateLimitError('3600').retry_after, 3600)
        self.assertEqual(RateLimitError(None).retry_after, 120)
        self.assertEqual(RateLimitError('NaN').retry_after, 120)

    def test_no_match_is_success_not_error(self):
        self.assertEqual(result_from_response({'matches': []}), {'ok': True, 'match': None})

    def test_bad_response_is_not_unknown_music(self):
        for value in ({}, None, {'matches': {}}, {'matches': [{}]}):
            with self.assertRaises(RecognitionError):
                result_from_response(value)

    def test_result_is_bounded_and_does_not_forward_urls(self):
        result = result_from_response({'matches': [{}], 'track': {
            'title': 'a'*1000, 'subtitle': 'Artist', 'key': '123', 'url': 'javascript:bad'}})
        self.assertEqual(len(result['match']['title']), 500)
        self.assertNotIn('url', result['match'])

    def test_rate_limit_and_denial_stop_after_one_request(self):
        for status in (429, 401, 403, 500):
            session = FakeSession(status)
            with self.assertRaises(RecognitionError):
                asyncio.run(FragmentClient(session).request('POST', 'https://amp.shazam.com/test'))
            self.assertEqual(session.calls, 1)

    def test_unexpected_endpoint_is_not_contacted(self):
        session = FakeSession(200)
        for url in ('http://amp.shazam.com/test', 'https://evil.example/test'):
            with self.assertRaises(RecognitionError):
                asyncio.run(FragmentClient(session).request('POST', url))
        self.assertEqual(session.calls, 0)


if __name__ == '__main__':
    unittest.main()
