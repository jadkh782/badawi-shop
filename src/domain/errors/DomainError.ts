/** Base class for every error the domain raises deliberately, as opposed to a bug. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
