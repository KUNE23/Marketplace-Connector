import { test, expect, vi } from 'vitest'; 
const { mockService } = vi.hoisted(() => ({ mockService: { createUser: vi.fn(() => 'mocked'), getUserById: vi.fn(), listUsers: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn() } })); 
vi.mock('../src/services/userService', () => mockService); 
import ctrl from '../src/controllers/userController.js'; 
test('controller uses mock', async () => { const next = vi.fn(); const res = { status: vi.fn(() => res), json: vi.fn(() => res), send: vi.fn() }; await ctrl.createUserHandler({ body: { email: 'a@b.com', password: 'secret12' } }, res, next); console.log('next', next.mock.calls, 'json', res.json.mock.calls); expect(mockService.createUser).toHaveBeenCalled(); }); 
