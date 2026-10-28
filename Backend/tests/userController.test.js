// Backend/tests/userController.test.js
const request = require('supertest');
const express = require('express');
const userRouter = require('../src/routes/users');
const authMiddleware = require('../src/middleware/auth');

// Mock authentication middleware to inject req.user
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    // Default to admin for most tests; can be overridden per test via header
    const role = req.headers['x-test-role'] || 'ADMIN';
    const id = req.headers['x-test-id'] || '1';
    req.user = { id: id.toString(), role };
    next();
  },
  authorizeRoles: () => (req, res, next) => next(),
  authorizeSelfOrRoles: () => (req, res, next) => next(),
}));

// Mock service layer
jest.mock('../src/services/userService', () => ({
  createUser: jest.fn(),
  getUserById: jest.fn(),
  listUsers: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}));

const { createUser, getUserById, listUsers, updateUser, deleteUser } = require('../src/services/userService');

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/api/users', userRouter);

describe('User Controller Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/users creates a user (admin)', async () => {
    createUser.mockResolvedValue({ id: 2n, email: 'new@ex.com', role: 'EMPLOYEE', active: true });
    const res = await request(app)
      .post('/api/users')
      .set('x-test-role', 'ADMIN')
      .send({ email: 'new@ex.com', password: 'secret12', role: 'EMPLOYEE' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@ex.com', role: 'EMPLOYEE' });
    expect(createUser).toHaveBeenCalled();
  });

  test('GET /api/users returns paginated list (admin)', async () => {
    listUsers.mockResolvedValue({ users: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/users?page=1&limit=10')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(listUsers).toHaveBeenCalledWith({ page: 1, limit: 10, search: undefined });
  });

  test('GET /api/users/:id returns self when employee', async () => {
    getUserById.mockResolvedValue({ id: 3n, email: 'self@ex.com', role: 'EMPLOYEE', active: true });
    const res = await request(app)
      .get('/api/users/3')
      .set('x-test-role', 'EMPLOYEE')
      .set('x-test-id', '3');
    expect(res.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(3n);
  });

  test('PATCH /api/users/:id prevents employee from changing role', async () => {
    updateUser.mockResolvedValue({ id: 4n, email: 'emp@ex.com', role: 'EMPLOYEE', active: true });
    const res = await request(app)
      .patch('/api/users/4')
      .set('x-test-role', 'EMPLOYEE')
      .set('x-test-id', '4')
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Employees cannot change role');
  });

  test('DELETE /api/users/:id allowed for admin', async () => {
    deleteUser.mockResolvedValue(true);
    const res = await request(app)
      .delete('/api/users/5')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith(5n);
  });
});
