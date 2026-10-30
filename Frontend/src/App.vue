<template>
  <div class="dashboard">
    <h1>Marketplace‑Connector Dashboard</h1>

    <!-- Login form – shown when not authenticated -->
    <div v-if="!auth.token" class="login-form">
      <h2>Login</h2>
      <form @submit.prevent="login">
        <div>
          <label>Email:</label>
          <input v-model="auth.email" type="email" required />
        </div>
        <div>
          <label>Password:</label>
          <input v-model="auth.password" type="password" required />
        </div>
        <button type="submit">Login</button>
      </form>
    </div>

    <!-- After login – show user‑specific UI -->
    <div v-else>
      <p>Logged in as {{ auth.user.email }} ({{ auth.user.role }})</p>
      <button @click="logout">Logout</button>

      <!-- Admin panel -->
      <div v-if="auth.user.role === 'ADMIN'">
        <h2>Admin: User Management</h2>

        <!-- Create new user form -->
        <div class="create-user">
          <h3>Create New User</h3>
          <form @submit.prevent="createUser">
            <div>
              <label>Email:</label>
              <input v-model="newUser.email" type="email" required />
            </div>
            <div>
              <label>Password:</label>
              <input v-model="newUser.password" type="password" required />
            </div>
            <div>
              <label>Name:</label>
              <input v-model="newUser.name" type="text" />
            </div>
            <div>
              <label>Role:</label>
              <select v-model="newUser.role">
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label>Active:</label>
              <input type="checkbox" v-model="newUser.active" />
            </div>
            <button type="submit">Create</button>
          </form>
        </div>

        <button @click="loadUsers">Refresh User List</button>
        <table v-if="users.length" class="user-table">
          <thead>
            <tr><th>ID</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td>
              <td>{{ u.email }}</td>
              <td>{{ u.role }}</td>
              <td>{{ u.active }}</td>
              <td>
                <button @click="deleteUser(u.id)">Delete</button>
                <button @click="toggleEdit(u.id)">{{ editUserId === u.id ? 'Cancel' : 'Edit' }}</button>
              </td>
            </tr>
            <tr v-if="editUserId && editUser" :key="'edit-'+editUserId">
              <td colspan="5">
                <form @submit.prevent="updateUser(editUserId)">
                  <div>
                    <label>Email:</label>
                    <input v-model="editUser.email" type="email" required />
                  </div>
                  <div>
                    <label>Password (leave blank to keep old):</label>
                    <input v-model="editUser.password" type="password" />
                  </div>
                  <div>
                    <label>Name:</label>
                    <input v-model="editUser.name" type="text" />
                  </div>
                  <div>
                    <label>Role:</label>
                    <select v-model="editUser.role">
                      <option value="EMPLOYEE">Employee</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label>Active:</label>
                    <input type="checkbox" v-model="editUser.active" />
                  </div>
                  <button type="submit">Save</button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>No users loaded.</p>
      </div>

      <!-- Employee panel – view own profile -->
      <div v-else>
        <h2>My Profile</h2>
        <button @click="loadMyProfile">Refresh Profile</button>
        <pre v-if="profile">{{ profile }}</pre>
      </div>
    </div>

    <pre v-if="status">{{ status }}</pre>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: '',
      auth: {
        token: null,
        email: '',
        password: '',
        user: null,
      },
      newUser: {
        email: '',
        password: '',
        name: '',
        role: 'EMPLOYEE',
        active: true,
      },
      editUserId: null,
      users: [],
      profile: null,
  methods: {
    async login() {
      try {
        const res = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.auth.email, password: this.auth.password }),
        });
        if (!res.ok) throw new Error('Login failed');
        const data = await res.json();
        this.auth.token = data.accessToken;
        this.auth.user = data.user;
        // store token for later requests (simple in‑memory; can be persisted to localStorage)
        this.status = 'Login successful';
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
    logout() {
      this.auth = { token: null, email: '', password: '', user: null };
      this.users = [];
      this.profile = null;
      this.status = 'Logged out';
    },
    async loadUsers() {
      try {
        const res = await fetch('http://localhost:3000/api/users', {
          headers: { Authorization: `Bearer ${this.auth.token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        this.users = data.users;
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
    async deleteUser(id) {
      try {
        await fetch(`http://localhost:3000/api/users/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.auth.token}` },
        });
        this.users = this.users.filter(u => u.id !== id);
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
    async createUser() {
      try {
        const payload = { ...this.newUser };
        if (!payload.name) delete payload.name;
        const res = await fetch('http://localhost:3000/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.auth.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Create user failed');
        }
        this.status = 'User created';
        this.newUser = { email: '', password: '', name: '', role: 'EMPLOYEE', active: true };
        this.loadUsers();
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
    toggleEdit(id) {
      if (this.editUserId === id) {
        this.editUserId = null;
        this.editUser = null;
        return;
      }
      const user = this.users.find(u => u.id === id);
      if (!user) return;
      this.editUserId = id;
      this.editUser = { email: user.email, password: '', name: user.name || '', role: user.role, active: user.active };
    },
    async updateUser(id) {
      try {
        const payload = { ...this.editUser };
        if (!payload.password) delete payload.password;
        const res = await fetch(`http://localhost:3000/api/users/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.auth.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Update failed');
        }
        const updated = await res.json();
        const idx = this.users.findIndex(u => u.id === id);
        if (idx !== -1) this.$set(this.users, idx, updated);
        this.status = 'User updated';
        this.editUserId = null;
        this.editUser = null;
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
    async updateMyProfile() {
      try {
        const payload = { email: this.myProfile.email, name: this.myProfile.name };
        if (this.myProfile.password) payload.password = this.myProfile.password;
        const res = await fetch('http://localhost:3000/api/users/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.auth.token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Profile update failed');
        }
        const updated = await res.json();
        this.profile = JSON.stringify(updated, null, 2);
        this.status = 'Profile updated';
        this.auth.user = { ...this.auth.user, ...updated };
        this.myProfile.email = updated.email;
        this.myProfile.name = updated.name || '';
        this.myProfile.password = '';
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    },
  },
};
</script>

<style scoped>
.dashboard {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: Arial, sans-serif;
}
.login-form {
  margin-top: 1rem;
}
.login-form div {
  margin-bottom: 0.5rem;
}
.user-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.user-table th, .user-table td {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}
pre {
  background: #f4f4f4;
  padding: 1rem;
  margin-top: 1rem;
  overflow-x: auto;
}
</style>

