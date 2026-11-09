// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isLoginCredentialField, releaseLoginCredentialFocus } from './loginAutofillRelease';

function fieldSnapshot(input) {
  return {
    autocomplete: input.getAttribute('autocomplete'),
    type: input.getAttribute('type'),
    name: input.getAttribute('name'),
    value: input.value,
    readOnly: input.readOnly,
    disabled: input.disabled,
  };
}

function mountForm({ passwordType = 'password', autocomplete = 'current-password', passwordValue = '' } = {}) {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-login-focus-sink tabindex="-1"></div>
    <input id="email" type="email" autocomplete="email" />
    <input id="pass" type="${passwordType}" autocomplete="${autocomplete}" />
    <button type="button" id="google">Google</button>
  `;
  document.body.appendChild(root);
  const email = root.querySelector('#email');
  const pass = root.querySelector('#pass');
  pass.value = passwordValue;
  return { root, email, pass, google: root.querySelector('#google'), sink: root.querySelector('[data-login-focus-sink]') };
}

describe('releaseLoginCredentialFocus', () => {
  it('blurs a focused password field without touching password-manager attributes', () => {
    const { root, pass, sink } = mountForm({ passwordValue: 'Secret12' });
    pass.focus();
    const before = fieldSnapshot(pass);
    const blurred = releaseLoginCredentialFocus(root);

    expect(blurred).toBe(true);
    expect(pass.isConnected).toBe(true);
    expect(fieldSnapshot(pass)).toEqual(before);
    expect(document.activeElement).not.toBe(pass);
    expect(document.activeElement).toBe(sink);
    expect(sink.getAttribute('tabindex')).toBe('-1');
    root.remove();
  });

  it('blurs a focused email field and a revealed password field', () => {
    const { root, email, pass } = mountForm({ passwordType: 'text', autocomplete: 'new-password' });
    expect(isLoginCredentialField(email)).toBe(true);
    expect(isLoginCredentialField(pass)).toBe(true);

    email.focus();
    const before = fieldSnapshot(pass);
    expect(releaseLoginCredentialFocus(root)).toBe(true);
    expect(fieldSnapshot(pass)).toEqual(before);
    expect(pass.getAttribute('autocomplete')).toBe('new-password');
    expect(pass.getAttribute('type')).toBe('text');
    root.remove();
  });

  it('moves focus off the Google button without editing the empty password field', () => {
    const { root, pass, google } = mountForm();
    google.focus();
    const before = fieldSnapshot(pass);
    const blurred = releaseLoginCredentialFocus(root);

    expect(blurred).toBe(false);
    expect(fieldSnapshot(pass)).toEqual(before);
    expect(pass.readOnly).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('[data-login-focus-sink]'));
    root.remove();
  });

  it('keeps the Google button focused when asked not to steal control focus', () => {
    const { root, pass, google } = mountForm();
    google.focus();
    const before = fieldSnapshot(pass);
    expect(releaseLoginCredentialFocus(root, document, { preserveControlFocus: true })).toBe(false);
    expect(document.activeElement).toBe(google);
    expect(fieldSnapshot(pass)).toEqual(before);
    root.remove();
  });

  it('leaves focus outside the login surface alone', () => {
    const { root, pass } = mountForm();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const before = fieldSnapshot(pass);

    expect(releaseLoginCredentialFocus(root)).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(fieldSnapshot(pass)).toEqual(before);
    root.remove();
    outside.remove();
  });
});
