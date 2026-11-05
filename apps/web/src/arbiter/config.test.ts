import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, normalizeUrl, saveConfig, validateConfig } from './config.ts';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('configuración del árbitro', () => {
  it('URL y team ID se recuerdan en el navegador; el token solo en la pestaña', () => {
    saveConfig({ url: 'https://arbitro.example', teamId: 'eq6', token: 'secreto' });
    expect(localStorage.getItem('arbitro.url')).toBe('https://arbitro.example');
    expect(localStorage.getItem('arbitro.teamId')).toBe('eq6');
    expect(localStorage.getItem('arbitro.token')).toBeNull();
    expect(sessionStorage.getItem('arbitro.token')).toBe('secreto');
    expect(loadConfig()).toEqual({
      url: 'https://arbitro.example',
      teamId: 'eq6',
      token: 'secreto',
    });
  });

  it('guardar un token vacío lo borra', () => {
    saveConfig({ url: 'https://a.example', teamId: 'eq6', token: 'x' });
    saveConfig({ url: 'https://a.example', teamId: 'eq6', token: '' });
    expect(sessionStorage.getItem('arbitro.token')).toBeNull();
  });

  it('si el almacenamiento está bloqueado, no rompe', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => saveConfig({ url: 'https://a.example', teamId: 'eq6', token: 't' })).not.toThrow();
    expect(loadConfig()).toEqual({ url: '', teamId: '', token: '' });
  });

  it('acepta HTTPS y HTTP local, y se queda solo con el origen', () => {
    expect(normalizeUrl(' https://arbitro.example/api/ ')).toBe('https://arbitro.example');
    expect(normalizeUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    expect(normalizeUrl('http://localhost:8787/x')).toBe('http://localhost:8787');
  });

  it('rechaza HTTP remoto, credenciales en la URL y texto que no es URL', () => {
    expect(normalizeUrl('http://arbitro.example')).toBeNull();
    expect(normalizeUrl('https://user:pass@arbitro.example')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('arbitro')).toBeNull();
  });

  it('valida el formulario campo por campo', () => {
    expect(validateConfig({ url: 'nada', teamId: 'eq 6', token: '' })).toEqual({
      ok: false,
      errors: { url: expect.any(String) as string, teamId: expect.any(String) as string },
    });
    expect(validateConfig({ url: 'https://a.example/', teamId: ' eq6 ', token: ' t ' })).toEqual({
      ok: true,
      config: { url: 'https://a.example', teamId: 'eq6', token: 't' },
    });
  });
});
