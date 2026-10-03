import { describe, expect, it } from 'vitest';
import { parseRoute, patientPath, testPath } from './router';

describe('routes', () => {
  it('round-trips patient and test paths, including unusual keys', () => {
    expect(parseRoute(patientPath('abc'))).toEqual({ name: 'patient', profileId: 'abc' });
    expect(parseRoute(testPath('abc', 'name:vitamin b/12'))).toEqual({ name: 'test', profileId: 'abc', testKey: 'name:vitamin b/12' });
  });

  it('parses the add flow and falls back to home', () => {
    expect(parseRoute('/app/add')).toEqual({ name: 'add' });
    expect(parseRoute('/app')).toEqual({ name: 'home' });
    expect(parseRoute('/app/')).toEqual({ name: 'home' });
    expect(parseRoute('/app/tests/718-7')).toEqual({ name: 'home' });
  });
});
