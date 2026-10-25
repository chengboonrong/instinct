import {BlackboardStore} from '../src/index.js';

function checkCompileTimeKeys() {
  const board = new BlackboardStore({health: 100, target: null as string | null});
  const health: number = board.get('health');
  const target: string | null = board.get('target');
  board.set('health', health);
  board.set('target', target);
  board.fork({health: 50});
  // @ts-expect-error health only accepts numbers
  board.set('health', 'hundred');
  // @ts-expect-error target key is not declared in this store
  board.set('mana', 20);
  // @ts-expect-error unknown key is rejected
  board.get('notAKey');
  // @ts-expect-error overrides must have appropriate value types
  board.fork({health: 'wrong'});
}
void checkCompileTimeKeys;
