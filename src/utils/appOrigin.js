// Production origin: Firebase Hosting site `tradeos-app` in project
// tradeos-91a58. https://tradeos-91a58.web.app 301-redirects here.
export const APP_ORIGIN = 'https://tradeos-app.web.app';

// Continue URL on password-reset and email-verification messages. Firebase
// hosts the action page on the auth domain, then sends the browser here.
// The continue URL's host must be an authorized domain.
export const authActionCodeSettings = {
  url: `${APP_ORIGIN}/`,
  handleCodeInApp: false,
};
