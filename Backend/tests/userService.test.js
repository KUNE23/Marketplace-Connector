import { describe, test, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';

const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      this.user = mockUser;
    }
  },
}));

import userService from '../src/services/userService.js';

const { createUser, getUserById, listUsers, updateUser, deleteUser } = userService;

describe('User Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('createUser hashes password and returns a public user', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockImplementation(({ data }) => ({
      id: 1n,
      email: data.email,
      name: data.name ?? null,
      role: data.role,
      active: data.active,
    }));

    const user = await createUser({
      email: 'test@example.com',
      password: 'secret12',
      role: 'ADMIN',
    });

    expect(mockUser.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });

    const createArgs = mockUser.create.mock.calls[0][0];
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'test@example.com', role: 'ADMIN' }),
      })
    );
    expect(createArgs.select.passwordHash).toBeUndefined();
    expect(bcrypt.compareSync('secret12', createArgs.data.passwordHash)).toBe(true);

    expect(user).toEqual({
      id: '1',
      email: 'test@example.com',
      name: null,
      role: 'ADMIN',
      active: true,
    });
    expect(user.passwordHash).toBeUndefined();
  });

  test('createUser rejects duplicate email', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 1n, email: 'dup@example.com' });

    await expect(
      createUser({ email: 'dup@example.com', password: 'pass123', role: 'EMPLOYEE' })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('createUser maps Prisma unique constraint to 409', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

    await expect(
      createUser({ email: 'dup@example.com', password: 'pass123', role: 'EMPLOYEE' })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('getUserById rejects unknown id with 404', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    await expect(getUserById(99n)).rejects.toMatchObject({ status: 404 });
  });

  test('getUserById never exposes passwordHash', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: 2n,
      email: 'user@example.com',
      name: 'User',
      role: 'EMPLOYEE',
      active: true,
      passwordHash: 'super-secret-hash',
    });

    const user = await getUserById(2n);

    expect(user).toEqual({
      id: '2',
      email: 'user@example.com',
      name: 'User',
      role: 'EMPLOYEE',
      active: true,
    });
    expect(user.passwordHash).toBeUndefined();
    expect(mockUser.findUnique.mock.calls[0][0].select.passwordHash).toBeUndefined();
  });

  test('listUsers applies pagination, search, and serializes ids', async () => {
    mockUser.findMany.mockResolvedValue([
      { id: 1n, email: 'a@b.com', name: null, role: 'ADMIN', active: true },
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
    expect(mockUser.findMany.mock.calls[0][0].select.passwordHash).toBeUndefined();
    expect(result).toEqual({
      users: [{ id: '1', email: 'a@b.com', name: null, role: 'ADMIN', active: true }],
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  test('updateUser hashes a new password and drops the plaintext field', async () => {
    mockUser.update.mockImplementation(({ data }) => ({
      id: 1n,
      email: data.email || 'old@example.com',
      name: data.name ?? null,
      role: data.role || 'ADMIN',
      active: data.active ?? true,
    }));

    const updated = await updateUser(1n, {
      email: 'new@example.com',
      password: 'newpass',
    });

    const updateArgs = mockUser.update.mock.calls[0][0];
    expect(updateArgs.data.email).toBe('new@example.com');
    expect(updateArgs.data.passwordHash).toBeDefined();
    expect(updateArgs.data.password).toBeUndefined();
    expect(updateArgs.select.passwordHash).toBeUndefined();
    expect(updated.id).toBe('1');
    expect(updated.passwordHash).toBeUndefined();
  });

  test('updateUser maps missing user to 404', async () => {
    mockUser.update.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'P2025' }));

    await expect(updateUser(99n, { name: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  test('updateUser maps duplicate email to 409', async () => {
    mockUser.update.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

    await expect(updateUser(1n, { email: 'dup@example.com' })).rejects.toMatchObject({
      status: 409,
    });
  });

  test('deleteUser calls Prisma delete', async () => {
    mockUser.delete.mockResolvedValue({});

    await deleteUser(5n);

    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 5n } });
  });

  test('deleteUser maps missing user to 404', async () => {
    mockUser.delete.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'P2025' }));

    await expect(deleteUser(99n)).rejects.toMatchObject({ status: 404 });
  });
});
