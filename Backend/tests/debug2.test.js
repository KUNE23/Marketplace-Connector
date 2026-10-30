import { test, expect, vi } from 'vitest'; 
vi.mock('../src/services/authService', () => ({ login: vi.fn(() => 'mocked'), __mocked: true })); 
import * as auth from '../src/services/authService.js'; 
test('local mock', () => { console.log(Object.keys(auth), auth.__mocked); expect(auth.login()).toBe('mocked'); }); 
