import { describe, expect, it } from 'vitest';
import { ABOUT_PATH, DATA_PATH, parseRoute, patientPath, summaryPath, testPath } from './router';

describe('routes', () => {
  it('round-trips patient and test paths, including unusual keys', () => {
    expect(parseRoute(patientPath('abc'))).toEqual({ name: 'patient', profileId: 'abc' });
    expect(parseRoute(testPath('abc', 'name:vitamin b/12'))).toEqual({ name: 'test', profileId: 'abc', testKey: 'name:vitamin b/12' });
    expect(parseRoute(summaryPath('abc'))).toEqual({ name: 'summary', profileId: 'abc' });
  });

  it('parses the add flow and falls back to home', () => {
    expect(parseRoute('/app/add')).toEqual({ name: 'add' });
    expect(parseRoute(DATA_PATH)).toEqual({ name: 'data' });
    expect(parseRoute(ABOUT_PATH)).toEqual({ name: 'about' });
    expect(parseRoute('/app')).toEqual({ name: 'home' });
    expect(parseRoute('/app/')).toEqual({ name: 'home' });
    expect(parseRoute('/app/tests/718-7')).toEqual({ name: 'home' });
  });
});
