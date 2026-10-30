import { describe, test, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import createError from 'http-errors';

const { mockService } = vi.hoisted(() => ({
  mockService: {
    createUser: vi.fn(),
    getUserById: vi.fn(),
    listUsers: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('../src/services/userService', () => mockService);

import userRouter from '../src/routes/users.js';
import errorHandler from '../src/middleware/errorHandler.js';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';

const app = express();
app.use(express.json());
app.use('/api/users', userRouter);
app.use(errorHandler);

function tokenFor(id, role) {
  return jwt.sign({ sub: String(id), role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '5m',
  });
}

function authAs(id, role) {
  return `Bearer ${tokenFor(id, role)}`;
}

const publicUser = {
  id: '2',
  email: 'employee@example.com',
  name: 'Employee',
  role: 'EMPLOYEE',
  active: true,
};

describe('User Controller / RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/users', () => {
    test('ADMIN creates a user and receives 201 without passwordHash', async () => {
      mockService.createUser.mockResolvedValue(publicUser);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ email: 'employee@example.com', password: 'secret12' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(publicUser);
      expect(res.body.passwordHash).toBeUndefined();
      expect(mockService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'employee@example.com', role: 'EMPLOYEE' })
      );
    });

    test('EMPLOYEE is forbidden (403)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authAs(2, 'EMPLOYEE'))
        .send({ email: 'x@example.com', password: 'secret12' });

      expect(res.status).toBe(403);
      expect(mockService.createUser).not.toHaveBeenCalled();
    });

    test('invalid payload returns 400', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ email: 'not-an-email', password: '123' });

      expect(res.status).toBe(400);
      expect(mockService.createUser).not.toHaveBeenCalled();
    });

    test('invalid role returns 400', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ email: 'x@example.com', password: 'secret12', role: 'SUPERADMIN' });

      expect(res.status).toBe(400);
      expect(mockService.createUser).not.toHaveBeenCalled();
    });

    test('missing token returns 401', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'x@example.com', password: 'secret12' });

      expect(res.status).toBe(401);
    });

    test('invalid token returns 401', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ email: 'x@example.com', password: 'secret12' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users', () => {
    test('ADMIN lists users with pagination and search', async () => {
      mockService.listUsers.mockResolvedValue({
        users: [publicUser],
        total: 1,
        page: 2,
        limit: 5,
      });

      const res = await request(app)
        .get('/api/users?page=2&limit=5&search=employee')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([publicUser]);
      expect(mockService.listUsers).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        search: 'employee',
      });
    });

    test('EMPLOYEE cannot list users (403)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', authAs(2, 'EMPLOYEE'));

      expect(res.status).toBe(403);
      expect(mockService.listUsers).not.toHaveBeenCalled();
    });

    test('invalid query returns 400', async () => {
      const res = await request(app)
        .get('/api/users?page=0&limit=999')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(400);
      expect(mockService.listUsers).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:id', () => {
    test('ADMIN can fetch any user', async () => {
      mockService.getUserById.mockResolvedValue(publicUser);

      const res = await request(app)
        .get('/api/users/2')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(publicUser);
      expect(mockService.getUserById).toHaveBeenCalledWith(2n);
    });

    test('EMPLOYEE can fetch own profile', async () => {
      mockService.getUserById.mockResolvedValue(publicUser);

      const res = await request(app)
        .get('/api/users/2')
        .set('Authorization', authAs(2, 'EMPLOYEE'));

      expect(res.status).toBe(200);
    });

    test('EMPLOYEE cannot fetch another user (403)', async () => {
      const res = await request(app)
        .get('/api/users/3')
        .set('Authorization', authAs(2, 'EMPLOYEE'));

      expect(res.status).toBe(403);
      expect(mockService.getUserById).not.toHaveBeenCalled();
    });

    test('invalid id returns 400', async () => {
      const res = await request(app)
        .get('/api/users/abc')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(400);
      expect(mockService.getUserById).not.toHaveBeenCalled();
    });

    test('unknown id returns 404', async () => {
      mockService.getUserById.mockRejectedValue(createError(404, 'User not found'));

      const res = await request(app)
        .get('/api/users/99')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
    });
  });

  describe('PATCH /api/users/:id', () => {
    test('ADMIN can update profile and role', async () => {
      mockService.updateUser.mockResolvedValue({ ...publicUser, role: 'ADMIN' });

      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ name: 'Updated', role: 'ADMIN' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('ADMIN');
      expect(mockService.updateUser).toHaveBeenCalledWith(2n, {
        name: 'Updated',
        role: 'ADMIN',
      });
    });

    test('EMPLOYEE can update own profile', async () => {
      mockService.updateUser.mockResolvedValue({ ...publicUser, name: 'Updated' });

      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(2, 'EMPLOYEE'))
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(mockService.updateUser).toHaveBeenCalledWith(2n, { name: 'Updated' });
    });

    test('EMPLOYEE cannot change own role (403)', async () => {
      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(2, 'EMPLOYEE'))
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(mockService.updateUser).not.toHaveBeenCalled();
    });

    test('EMPLOYEE cannot change own active status (403)', async () => {
      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(2, 'EMPLOYEE'))
        .send({ active: false });

      expect(res.status).toBe(403);
      expect(mockService.updateUser).not.toHaveBeenCalled();
    });

    test('EMPLOYEE cannot update another user (403)', async () => {
      const res = await request(app)
        .patch('/api/users/3')
        .set('Authorization', authAs(2, 'EMPLOYEE'))
        .send({ name: 'Nope' });

      expect(res.status).toBe(403);
    });

    test('empty body returns 400', async () => {
      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({});

      expect(res.status).toBe(400);
      expect(mockService.updateUser).not.toHaveBeenCalled();
    });

    test('invalid id returns 400', async () => {
      const res = await request(app)
        .patch('/api/users/-1')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ name: 'X' });

      expect(res.status).toBe(400);
    });

    test('unknown id returns 404', async () => {
      mockService.updateUser.mockRejectedValue(createError(404, 'User not found'));

      const res = await request(app)
        .patch('/api/users/99')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });

    test('duplicate email returns 409', async () => {
      mockService.updateUser.mockRejectedValue(
        createError(409, 'User with this email already exists')
      );

      const res = await request(app)
        .patch('/api/users/2')
        .set('Authorization', authAs(1, 'ADMIN'))
        .send({ email: 'taken@example.com' });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/users/:id', () => {
    test('ADMIN can delete a user (204)', async () => {
      mockService.deleteUser.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/users/2')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(204);
      expect(mockService.deleteUser).toHaveBeenCalledWith(2n);
    });

    test('EMPLOYEE cannot delete a user (403)', async () => {
      const res = await request(app)
        .delete('/api/users/2')
        .set('Authorization', authAs(2, 'EMPLOYEE'));

      expect(res.status).toBe(403);
      expect(mockService.deleteUser).not.toHaveBeenCalled();
    });

    test('unknown id returns 404', async () => {
      mockService.deleteUser.mockRejectedValue(createError(404, 'User not found'));

      const res = await request(app)
        .delete('/api/users/99')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(404);
    });

    test('invalid id returns 400', async () => {
      const res = await request(app)
        .delete('/api/users/abc')
        .set('Authorization', authAs(1, 'ADMIN'));

      expect(res.status).toBe(400);
    });
  });
});
