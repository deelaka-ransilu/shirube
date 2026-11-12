// Throw this from a route to send an error to the browser.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
