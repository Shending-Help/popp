import { assertTransition } from './state-machine';
import { IllegalTransitionError } from '../../common/errors/domain-errors';

describe('assertTransition', () => {
  it('allows CREATED -> ONGOING', () => {
    expect(assertTransition('CREATED', 'ONGOING')).toBe('APPLY');
  });

  it('allows ONGOING -> COMPLETED', () => {
    expect(assertTransition('ONGOING', 'COMPLETED')).toBe('APPLY');
  });

  it.each([
    ['CREATED', 'COMPLETED'],   // deliberately excluded — see status.ts
    ['ONGOING', 'CREATED'],
    ['COMPLETED', 'ONGOING'],
    ['COMPLETED', 'CREATED'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
  });

  // Callers are retrying background workers. One that commits and then crashes
  // before acking its queue message WILL re-issue the same transition.
  it.each(['CREATED', 'ONGOING', 'COMPLETED'] as const)(
    'treats %s -> same status as an idempotent no-op',
    (status) => {
      expect(assertTransition(status, status)).toBe('NOOP');
    },
  );

  it('reports both states in the error message', () => {
    expect(() => assertTransition('COMPLETED', 'ONGOING'))
      .toThrow(/COMPLETED.*ONGOING/);
  });
});
