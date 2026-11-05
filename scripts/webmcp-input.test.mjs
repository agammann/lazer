import test from 'node:test';
import assert from 'node:assert/strict';
import { webMcpArguments } from './webmcp-input.mjs';

test('Chromium 153 and 154 receive serialized valid and invalid arguments', () => {
  for (const version of ['153.0.8010.12', '154.0.8040.0']) {
    for (const input of [{}, { unexpected: true }]) {
      const encoded = webMcpArguments(version, input);
      assert.equal(typeof encoded, 'string');
      assert.deepEqual(JSON.parse(encoded), input);
    }
  }
});

test('Chrome 155 boundary and Edge 156 retain JavaScript input objects', () => {
  for (const version of ['155.0.8052.0', '156.0.4314.58']) {
    for (const input of [{}, { unexpected: true }]) {
      assert.equal(webMcpArguments(version, input), input);
    }
  }
});

test('unknown browser versions fail before a native invocation can occur', () => {
  for (const version of [undefined, null, 153, '', '155', 'Chromium 155.0.8052.0', '0.0.0']) {
    assert.throws(() => webMcpArguments(version, {}), /Expected a Chromium browser version/);
  }
});
