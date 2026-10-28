// Backend/tests/userService.test.js
import bcrypt from 'bcrypt';
import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock PrismaClient
vi.mock('@prisma/client', () => {
  const mockUser = {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const PrismaClient = vi.fn(() => ({ user: mockUser }));
  return { PrismaClient };
});

const { PrismaClient } = require('@prisma/client');
const { createUser, getUserById, listUsers, updateUser, deleteUser } = require('../src/services/userService');

describe('User Service', () => {
  let mockUser;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = PrismaClient().user;
  });

  test('createUser should hash password and store user', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockImplementation(({ data }) => {
      return { id: 1n, email: data.email, role: data.role, active: data.active };
    });
    const user = await createUser({ email: 'test@example.com', password: 'secret12', role: 'ADMIN' });
    expect(mockUser.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    const passwordHash = mockUser.create.mock.calls[0][0].data.passwordHash;
    expect(bcrypt.compareSync('secret12', passwordHash)).toBe(true);
    expect(user).toMatchObject({ email: 'test@example.com', role: 'ADMIN', active: true });
  });

  test('createUser should error on duplicate email', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 1n, email: 'dup@example.com' });
    await expect(
      createUser({ email: 'dup@example.com', password: 'pass123', role: 'EMPLOYEE' })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('listUsers should apply pagination and optional search', async () => {
    mockUser.findMany.mockResolvedValue([
      { id: 1n, email: 'a@b.com', role: 'ADMIN', active: true },
    ]);
    mockUser.count.mockResolvedValue(1);
    const result = await listUsers({ page: 2, limit: 10, search: 'a@b.com' });
    expect(mockUser.findMany).toHaveBeenCalledWith({
      skip: 10,
      take: 10,
      where: { email: { contains: 'a@b.com', mode: 'insensitive' } },
      orderBy: { id: 'asc' },
      select: expect.any(Object),
    });
    expect(result).toEqual({ users: expect.any(Array), total: 1, page: 2, limit: 10 });
  });

  test('updateUser should hash new password if provided', async () => {
    mockUser.update.mockImplementation(({ data }) => {
      return { id: 1n, email: data.email || 'old@example.com', role: data.role || 'ADMIN', active: true };
    });
    const updated = await updateUser(1n, { email: 'new@example.com', password: 'newpass' });
    expect(mockUser.update).toHaveBeenCalled();
    const updateArg = mockUser.update.mock.calls[0][0].data;
    expect(updateArg.email).toBe('new@example.com');
    expect(updateArg.passwordHash).toBeDefined();
    expect(updated.email).toBe('new@example.com');
  });

  test('deleteUser should call prisma delete', async () => {
    mockUser.delete.mockResolvedValue({});
    await deleteUser(5n);
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 5n } });
  });
});
