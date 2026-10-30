import type { Stmt } from './ir.js';

/** Calls `fn` for every statement in `body`, depth first, including nested bodies. */
export function visitStatements(body: readonly Stmt[], fn: (stmt: Stmt) => void): void {
  for (const stmt of body) {
    fn(stmt);
    switch (stmt.kind) {
      case 'if':
        visitStatements(stmt.then, fn);
        visitStatements(stmt.else, fn);
        break;
      case 'while':
      case 'repeat':
      case 'forever':
        visitStatements(stmt.body, fn);
        break;
      default:
        break;
    }
  }
}
